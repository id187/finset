"""Three-valued conditions: unknown never means eligible or earned bonus."""
import math
UNKNOWN=None
def evaluate(expr,facts):
 if type(expr) is bool:return expr,set()
 if not isinstance(expr,dict) or len(expr)!=1:raise ValueError('Invalid condition')
 op,arg=next(iter(expr.items()))
 if op=='at_least':
  threshold,children=arg;values=[evaluate(e,facts) for e in children]
  yes=sum(v is True for v,_ in values);maybe=sum(v is None for v,_ in values)
  if yes>=threshold:return True,set()
  if yes+maybe<threshold:return False,set()
  return None,set().union(*(m for v,m in values if v is None))
 if op in ('all','any'):
  values=[evaluate(e,facts) for e in arg];states=[v for v,_ in values]
  if op=='all' and False in states:return False,set()
  if op=='any' and True in states:return True,set()
  missing=set().union(*(m for v,m in values if v is None))
  return (None,missing) if missing or None in states else (op=='all',set())
 if op=='not':
  v,m=evaluate(arg,facts);return (None if v is None else not v),m
 if op not in ('eq','gte','lte','in'):raise ValueError('Unsupported operator')
 key,target=arg;v=facts.get(key)
 if v is None:return None,{key}
 if op=='eq':return type(v)==type(target) and v==target,set()
 if op=='in':return v in target,set()
 if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v):raise ValueError('숫자 응답 필요: '+key)
 return (v>=target if op=='gte' else v<=target),set()

def bonus(rule,facts):
 # Mutually exclusive components contribute only their winning component.
 groups={}
 for component in rule.get('bonus',[]):
  state,missing=evaluate(component['when'],facts)
  key=component.get('exclusive_group',component['id'])
  groups.setdefault(key,[]).append((float(component['rate']),component['id'],state,missing))
 low=high=0.;questions=set();earned=[]
 for entries in groups.values():
  confirmed=sorted((r,i) for r,i,s,m in entries if s is True)
  floor=confirmed[-1][0] if confirmed else 0.
  ceiling=max([floor]+[r for r,i,s,m in entries if s is None])
  low+=floor;high+=ceiling
  if confirmed and floor>0:earned.append(confirmed[-1][1])
  for r,i,s,m in entries:
   if s is None and r>floor:questions.update(m)
 cap=rule.get('bonus_cap')
 if cap is not None:
  low=min(low,cap);high=min(high,cap)
  if low>=cap:questions=set()
 return low,high,questions,earned
