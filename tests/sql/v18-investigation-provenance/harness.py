#!/usr/bin/env python3
"""Disposable PostgreSQL repro ONLY; no JWT/production acceptance."""
import json
import os
from pathlib import Path
import uuid
from fixture import build

DB='v18_investigation_fixture'
MARKER='v18-investigation-provenance-only-v1'

def options(env=None):
    env=os.environ if env is None else env
    expected={'PGHOST':'127.0.0.1','PGPORT':'55434','PGDATABASE':DB,
              'PGUSER':'postgres','PGPASSWORD':'synthetic-provenance-job-only'}
    if any(env.get(k)!=v for k,v in expected.items()):
        raise ValueError('unexpected disposable target')
    if any(env.get(k) for k in ('PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGHOSTADDR','PGPASSFILE')):
        raise ValueError('unexpected libpq override')
    return dict(host='127.0.0.1',port=55434,dbname=DB,user='postgres',
                password=expected['PGPASSWORD'],sslmode='disable',connect_timeout=10,
                options='-c statement_timeout=10000 -c lock_timeout=5000')


def run():
    import psycopg
    checks=[]
    def check(ok,name):
        if not ok: raise AssertionError(name)
        checks.append(name)
    with psycopg.connect(**options(),autocommit=True) as c:
        check(c.execute("select current_database(),inet_server_port(),current_setting('server_version_num')::int").fetchone()==(DB,5432,170006),'dedicated PostgreSQL17.6 target')
        check(c.execute("select count(*) from pg_namespace where nspname not in ('public','information_schema') and nspname not like 'pg_%'").fetchone()[0]==0,'fresh schemas')
        check(c.execute("select count(*) from pg_class where relnamespace='public'::regnamespace and relkind in ('r','p','v','m','f')").fetchone()[0]==0,'fresh public catalog')
        c.execute('create schema fixture_boundary; create table fixture_boundary.marker(marker text primary key)')
        c.execute('insert into fixture_boundary.marker values(%s)',(MARKER,))
        sql,evidence=build();c.execute(sql)
        alice,bob=uuid.uuid4(),uuid.uuid4()
        for owner in (alice,bob):
            c.execute('insert into auth.users values(%s)',(owner,))
            c.execute('insert into public.profiles values(%s,100,50,5,null)',(owner,))
        def investigation():
            inv=uuid.uuid4()
            c.execute("insert into public.investigations values(%s,%s,true,%s::jsonb)",(inv,str(inv),json.dumps({'xp':10,'dinars':3,'hearts':0})))
            return inv
        def actor(sql,args=(),owner=alice):
            with c.transaction():
                c.execute('set local role authenticated')
                c.execute("select set_config('request.jwt.claim.sub',%s,true)",(str(owner),))
                return c.execute(sql,args).fetchone()
        def complete(inv,delta,owner=alice):
            return actor('select public.complete_investigation_v2(%s,%s,0,0)',(inv,delta),owner)[0]
        def balances():
            return c.execute('select xp,dinars,hearts from public.profiles where id=%s',(alice,)).fetchone()
        valid=investigation(); delta=uuid.uuid4()
        r=complete(valid,delta)
        check(r['reward_granted'] is True and balances()==(110,53,5),'positive fresh completion grants exact catalog reward')
        r=complete(valid,uuid.uuid4())
        check(r['already_completed'] is True and balances()==(110,53,5),'positive replay does not regrant economy')
        forged=investigation()
        actor("insert into public.user_investigation_progress(user_id,investigation_id,reward_snapshot) values(%s,%s,%s::jsonb) returning id",(alice,forged,json.dumps({'v':1,'artifact':'forged-artifact','xp':999,'dinars':999})))
        r=complete(forged,uuid.uuid4())
        check(r['reward_snapshot']['xp']==999 and r['collectible_reconciliation']=='artifact_restored_from_snapshot','REPRO own inserted snapshot is consumed as reward evidence')
        check(c.execute("select count(*) from public.user_collection where user_id=%s and item_id='forged-artifact'",(alice,)).fetchone()[0]==1,'REPRO forged snapshot produces collectible write')
        before=balances()
        collision=investigation(); collision_id=uuid.uuid4()
        actor("insert into public.applied_profile_deltas(delta_id,user_id,xp,dinars,source) values(%s,%s,777,888,'unrelated-client-row') returning delta_id",(collision_id,alice))
        r=complete(collision,collision_id)
        check(r['ok'] is True and r['applied'] is True and r['reward_granted'] is False,'REPRO collision reports stamped completion without economy grant')
        check(r['reward_snapshot']['xp']==10 and balances()==before,'REPRO catalog snapshot is not proof of wallet inclusion')
        check(c.execute('select xp,dinars from public.applied_profile_deltas where delta_id=%s',(collision_id,)).fetchone()==(777,888),'REPRO conflicting ledger payload retained')
        # Isolation control: permissive own-write policy is not arbitrary-owner access.
        try:
            actor('insert into public.user_investigation_progress(user_id,investigation_id) values(%s,%s) returning id',(bob,investigation()))
        except psycopg.Error as e:
            check(e.sqlstate=='42501','cross-owner progress insert remains denied')
        else: raise AssertionError('cross-owner insert accepted')
        return {'result':'PASS_REPRODUCED','scope':'synthetic dependencies with exact source function/policies; SQL claims NOT JWT; no production proof','checks':checks,'source_evidence':evidence}

if __name__=='__main__':
    output=Path(__file__).with_name('acceptance.json')
    if output.exists(): output.unlink()
    try:
        report=run()
    except Exception as e:
        # Never print raw database exceptions, connection parameters or payloads.
        report={'result':'FAIL','error_type':type(e).__name__,'sqlstate':getattr(e,'sqlstate',None)}
    output.write_text(json.dumps(report,indent=2)+'\n')
    print(report['result'])
    raise SystemExit(0 if report['result']=='PASS_REPRODUCED' else 1)
