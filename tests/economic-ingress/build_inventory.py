"""Read-only inventory builder. Requires external audit tool pglast==8.7.
Never executes migrations. The output is evidence candidates, not SQL semantics.
"""
import hashlib,json,re
from pathlib import Path
from pglast import parse_sql
from pglast.stream import RawStream
ROOT=Path(__file__).resolve().parents[2]
ECONOMIC={'profiles','applied_profile_deltas','user_investigation_progress','user_story_completions','user_achievements','user_streak_reward_claims','user_campaign_progress','user_gameplay_progress','user_collection','admin_balance_grants','user_referrals','referrals','referral_rewards','user_streak_days','user_campaign_completions','user_titles','cloud_saves','game_progress'}

def sha(data):return hashlib.sha256(data).hexdigest()
def signature(name,args):return '.'.join(x.sval for x in name)+'('+','.join(RawStream()(x) for x in args)+')'
def build():
    latest={};errors=[];pins={};security=[];removals=[]
    for path in sorted((ROOT/'supabase/migrations').glob('*.sql')):
        raw=path.read_bytes();text=raw.decode();rel=str(path.relative_to(ROOT));pins[rel]=sha(raw)
        try: statements=parse_sql(text)
        except Exception as e:
            errors.append({'path':rel,'reason':str(e),'impact':'unknown SQL effects; inventory not complete'});continue
        for st in statements:
            n=st.stmt;kind=type(n).__name__
            piece=(text[st.stmt_location:st.stmt_location+st.stmt_len] if st.stmt_len else text[st.stmt_location:]).encode()
            evidence={'path':rel,'start_byte':len(text[:st.stmt_location].encode()),'byte_length':len(piece),'sha256':sha(piece)}
            if kind in ('RenameStmt','AlterObjectSchemaStmt'):
                errors.append({'path':rel,'reason':'unresolved rename/schema move: '+RawStream()(n),'impact':'names and call resolution require manual catalog review'})
            if kind=='CreateFunctionStmt':
                args=[p.argType for p in n.parameters or [] if p.mode.name not in ('FUNC_PARAM_OUT','FUNC_PARAM_TABLE')]
                sig=signature(n.funcname,args)
                latest[sig]={'signature':sig,'name':'.'.join(x.sval for x in n.funcname),'source':evidence,'text':piece.decode(),'definition_order':path.name}
            elif kind=='DropStmt' and 'FUNCTION' in RawStream()(n)[:30]:
                for obj in n.objects:
                    if obj.args_unspecified:
                        errors.append({'path':rel,'reason':'DROP FUNCTION unspecified arguments','impact':'overload removal requires review'})
                    else:
                        sig=signature(obj.objname,obj.objargs or [])
                        latest.pop(sig,None);removals.append({'signature':sig,'source':evidence})
            if kind in ('GrantStmt','CreatePolicyStmt','AlterPolicyStmt','CreateTrigStmt','AlterDefaultPrivilegesStmt','AlterOwnerStmt','AlterFunctionStmt','AlterTableStmt','DropStmt'):
                security.append({'kind':kind,'source':evidence,'sql':RawStream()(n)})
    # Text-level candidate edges are intentionally over-inclusive, not resolved calls.
    candidates={}
    for sig,entry in latest.items():
        body=entry['text']
        writes=sorted(set(x.lower() for x in re.findall(r'(?i)\b(?:update|insert\s+into|delete\s+from)\s+(?:public\.)?([a-z_][a-z_0-9]*)',body)))
        tables=sorted(set(x.lower() for x in re.findall(r'(?i)\b(?:public\.)?('+ '|'.join(sorted(ECONOMIC)) + r')\b',body)))
        entry['write_table_candidates']=writes
        entry['economic_table_mentions']=tables
        entry['call_candidates']=sorted(set(x.lower() for x in re.findall(r'(?i)\bpublic\.([a-z_][a-z_0-9]*)\s*\(',body)))
        entry['dynamic_sql_present']=bool(re.search(r'(?i)\bEXECUTE\b',body))
        if set(writes)&ECONOMIC or re.search(r'(?i)\bNEW\.(xp|dinars|hearts|streak)\b',body):candidates[sig]=entry
    # Include visible transitive callers of known candidates until fixed point.
    while True:
        names={e['name'].split('.')[-1] for e in candidates.values()};before=len(candidates)
        for sig,e in latest.items():
            if names.intersection(e['call_candidates']):candidates[sig]=e
        if len(candidates)==before:break
    for e in candidates.values():
        e['economic_column_mentions']=sorted(set(re.findall(r'(?i)\b(xp|dinars|hearts|streak|longest_streak|last_streak_day|reward_snapshot|xp_earned|dinars_earned|hearts_earned|reward_version|reward_key|rewards_payload)\b',e['text'].lower())))
        e.pop('text');e['economic_columns']='Mentions only, not proven write set; inspect transitive routines/triggers'
        e['effective_privileges']='UNVERIFIED: repository statements are not deployed ACL/RLS/owner/default/membership catalog'
        e['proposed_cohort_action']='legacy cohort unchanged; enrolled cohort deny until explicit typed authority route and transaction admission reviewed'
        e['source_status']='latest parsed repository CREATE after explicit signature DROPs; invalid migrations/dynamic SQL remain unresolved'
    names={e['name'].split('.')[-1] for e in candidates.values()}
    security=[x for x in security if any(re.search(r'(?i)\b'+re.escape(name)+r'\b',x['sql']) for name in ECONOMIC|names) or x['kind']=='AlterDefaultPrivilegesStmt']
    clients=[]
    for path in sorted((ROOT/'src').rglob('*')):
        if path.suffix not in ('.ts','.tsx'):continue
        text=path.read_text();calls=sorted(set(re.findall(r'\.rpc\s*\(\s*["\x27]([^"\x27]+)',text))&names)
        direct=sorted(set(re.findall(r'\.from\s*\(\s*["\x27]([^"\x27]+)',text))&ECONOMIC)
        if calls or direct:
            clients.append({'path':str(path.relative_to(ROOT)),'sha256':sha(path.read_bytes()),'rpc_candidates':calls,'table_candidates':direct,'limit':'lexical literal calls only; wrapper/dynamic/local writers require manual coverage'})
    return {'format':1,'economic_table_watchlist':sorted(ECONOMIC),'decision':'HOLD; no admission or migration authorized','parser':'pglast8.7 read-only AST, lexical body candidates','migration_pins':pins,'unparsed_or_unresolved':errors,'function_candidates':list(candidates.values()),'explicit_drops':removals,'security_statements':security,'client_candidates':clients,'unknowns':['deployed catalog and migration application order','dynamic SQL and unresolved calls','triggers and indirect writer closure','service/admin/jobs and external integrations','economic column semantics','all browser/localStorage/IDB/native writers','real eligibility and historical baseline']}
if __name__=='__main__':
    out=Path(__file__).with_name('manifest.json');out.write_text(json.dumps(build(),indent=2,ensure_ascii=False)+'\n')
