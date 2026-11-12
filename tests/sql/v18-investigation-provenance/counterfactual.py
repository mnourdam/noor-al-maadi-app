"""Actual SQL counterfactual checks; called only after original repro completes."""
import json
import hashlib
from pathlib import Path
import time
import uuid
from concurrent.futures import ThreadPoolExecutor


def run(c, connect, check):
    import psycopg
    from psycopg import sql
    guard_bytes=Path(__file__).with_name('guarded.sql').read_bytes()
    c.execute(guard_bytes.decode())
    owner=uuid.uuid4()
    c.execute('insert into auth.users values(%s)',(owner,))
    c.execute('insert into public.profiles values(%s,100,50,5,null)',(owner,))
    def inv(approve=True,artifact=None):
        key=uuid.uuid4()
        c.execute('insert into public.investigations values(%s,%s,true,%s::jsonb)',(key,str(key),json.dumps({'xp':10,'dinars':3,'hearts':0,'version':1,'artifact':artifact})))
        if approve:
            # Admin selects frozen catalog values, not a caller-supplied approval flag.
            c.execute("insert into investigation_guard.approvals select %s,id,(reward->>'version')::int,(reward->>'xp')::int,(reward->>'dinars')::int,(reward->>'hearts')::int,reward->>'artifact' from public.investigations where id=%s",(owner,key))
        return key
    def call(conn,key):
        with conn.transaction():
            conn.execute('set local role authenticated')
            conn.execute("select set_config('request.jwt.claim.sub',%s,true)",(str(owner),))
            return conn.execute('select investigation_guard.complete(%s)',(key,)).fetchone()[0]
    def snapshot():
        tables=['public.profiles','public.user_investigation_progress','public.applied_profile_deltas','public.user_collection','investigation_guard.approvals','investigation_guard.issuance']
        return {t:sorted([json.dumps(r[0],sort_keys=True) for r in c.execute(sql.SQL('select to_jsonb(t) from {} t').format(sql.Identifier(*t.split('.')))).fetchall()]) for t in tables}
    def rejects(action,label,code='P0001',reason=None):
        before=snapshot()
        try: action()
        except psycopg.Error as e:
            check(e.sqlstate==code and (not reason or reason in str(e)),label)
        else: raise AssertionError(label)
        check(snapshot()==before,label+' unchanged protected state')
    for table in ['public.profiles','public.user_investigation_progress','public.applied_profile_deltas','public.user_collection','investigation_guard.approvals','investigation_guard.issuance']:
        for privilege in ['INSERT','UPDATE','DELETE','TRUNCATE']:
            check(not c.execute('select has_table_privilege(%s,%s,%s)',('authenticated',table,privilege)).fetchone()[0],'guarded client lacks '+privilege+' '+table)
        def direct(t=table):
            with c.transaction():
                c.execute('set local role authenticated')
                c.execute(sql.SQL('delete from {} where false').format(sql.Identifier(*t.split('.'))))
        rejects(direct,'guarded direct mutation denied '+table,'42501')
    for signature in ['public.complete_investigation_v2(uuid,uuid,integer,integer)','public.apply_profile_delta(uuid,integer,integer,integer,text)']:
        check(not c.execute("select has_function_privilege('authenticated',%s,'EXECUTE')",(signature,)).fetchone()[0],'guarded old producer disabled '+signature)
    missing=inv(False)
    rejects(lambda:call(c,missing),'missing trusted synthetic approval rejected',reason='approval-missing')
    good=inv(artifact='approved-first-artifact');receipt=call(c,good)
    check(receipt['approval']['xp']==10 and receipt['xp_total']==110,'guarded approved fresh grant')
    check(c.execute("select count(*) from public.user_collection where user_id=%s and item_id='approved-first-artifact'",(owner,)).fetchone()[0]==1,'guarded approved artifact inserted once')
    before=snapshot()
    check(call(c,good)==receipt and snapshot()==before,'guarded exact replay unchanged')
    c.execute("update public.investigations set reward=%s::jsonb where id=%s",(json.dumps({'xp':100,'dinars':40,'hearts':4,'version':2}),good))
    before=snapshot()
    check(call(c,good)==receipt and snapshot()==before,'content edit cannot regrant or rewrite history')
    for exact in (False,True):
        key=inv();d=c.execute('select investigation_guard.delta_id(%s,%s)',(owner,key)).fetchone()[0]
        c.execute('insert into public.applied_profile_deltas(delta_id,user_id,xp,dinars,source) values(%s,%s,%s,%s,%s)',(d,owner,10 if exact else 999,3 if exact else 888,'isolated-investigation-once-v1:'+str(key) if exact else 'conflict'))
        rejects(lambda:call(c,key),'unverified '+('exact-looking' if exact else 'conflicting')+' ledger rejected',reason='unverified-ledger')
    key=inv()
    c.execute('insert into public.user_investigation_progress(user_id,investigation_id) values(%s,%s)',(owner,key))
    rejects(lambda:call(c,key),'unverified legacy completion not adopted',reason='unverified-completion')
    # Real overlap: first holds profile-row lock; second must block before release.
    key=inv(artifact='approved-race-artifact')
    before_balance=c.execute('select xp,dinars,hearts from public.profiles where id=%s',(owner,)).fetchone()
    with connect() as first,connect() as second,ThreadPoolExecutor(max_workers=1) as pool:
        with first.transaction():
            winner=call(first,key)
            future=pool.submit(call,second,key)
            deadline=time.monotonic()+5;blocked=False
            while time.monotonic()<deadline:
                row=c.execute('select wait_event_type,pg_blocking_pids(pid) from pg_stat_activity where pid=%s',(second.info.backend_pid,)).fetchone()
                if row and row[0]=='Lock' and first.info.backend_pid in row[1]:blocked=True;break
                if future.done():break
                time.sleep(.02)
            check(blocked,'guarded concurrent request observed blocked on first transaction')
        replay=future.result(timeout=15)
    check(replay==winner and c.execute('select count(*) from investigation_guard.issuance where owner=%s and investigation=%s',(owner,key)).fetchone()[0]==1,'guarded concurrent identical calls one grant identical receipts')
    check(c.execute('select xp,dinars,hearts from public.profiles where id=%s',(owner,)).fetchone()==(before_balance[0]+10,before_balance[1]+3,before_balance[2]),'concurrent exact once-only balance increment')
    delta=winner['delta_id']
    check(c.execute('select count(*) from public.applied_profile_deltas where delta_id=%s',(delta,)).fetchone()[0]==1,'concurrent single delta row')
    check(c.execute('select count(*) from public.user_investigation_progress where user_id=%s and investigation_id=%s',(owner,key)).fetchone()[0]==1,'concurrent single completion row')
    check(c.execute("select count(*) from public.user_collection where user_id=%s and item_id='approved-race-artifact'",(owner,)).fetchone()[0]==1,'concurrent single collectible')
    c.execute("create function fixture_boundary.guard_fault() returns trigger language plpgsql as $$ begin raise exception 'guarded-test-fault'; end $$")
    c.execute('revoke all on function fixture_boundary.guard_fault() from public')
    for table in ['public.applied_profile_deltas','investigation_guard.issuance']:
        key=inv(artifact='fault-artifact-'+table)
        c.execute(sql.SQL('create trigger fixture_fault after insert on {} for each row execute function fixture_boundary.guard_fault()').format(sql.Identifier(*table.split('.'))))
        try:rejects(lambda:call(c,key),'fault after '+table+' atomically rolls back',reason='guarded-test-fault')
        finally:c.execute(sql.SQL('drop trigger fixture_fault on {}').format(sql.Identifier(*table.split('.'))))
    c.execute('drop function fixture_boundary.guard_fault()')

    return {'guarded_sql_sha256':hashlib.sha256(guard_bytes).hexdigest(),'scope':'counterfactual synthetic approval only; production eligibility issuer UNKNOWN'}
