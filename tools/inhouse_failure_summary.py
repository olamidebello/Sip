import pathlib,re
folders=[p for p in pathlib.Path('/opt/olamide/backups').glob('inhouse-free-*') if p.is_dir() and re.fullmatch(r'inhouse-free-[A-Za-z0-9]{8}',p.name)]
if not folders:print('INHOUSE_CHECK error=no_backup')
else:
 folder=max(folders,key=lambda p:p.stat().st_mtime);print('INHOUSE_CHECK backup='+folder.name)
 log=folder/'deploy.log';s=log.read_text(errors='replace') if log.exists() else ''
 for code,pattern in [('layout_mismatch',r'unknown.*layout|unknown source|bridge.*missing|Paid route gate missing'),('missing_file',r'No such file|ENOENT'),('active_calls',r'Finish active calls|INHOUSE_GATE error=active_calls'),('rpc_unavailable',r'connect.*(?:refused|socket)|kamcmd.*error|INHOUSE_GATE error=rpc_unavailable'),('rpc_invalid_response',r'INHOUSE_GATE error=rpc_invalid_response'),('switch_syntax',r'parse error|syntax error|config file invalid'),('javascript',r'SyntaxError|Cannot find module'),('image_build',r'failed to solve|npm ERR'),('tests',r'fail [1-9]|not ok '),('missing_table',r"Table .*doesn't exist")]:
  if re.search(pattern,s,re.I):print('INHOUSE_CHECK error='+code)
 print('INHOUSE_CHECK review_private_log=true')
