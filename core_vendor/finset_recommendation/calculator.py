"""Explicit models only. Tax and anniversary rounding are comparison assumptions."""
from decimal import Decimal,ROUND_FLOOR
from datetime import date,timedelta
import calendar
D=lambda x:Decimal(str(x))
def month(d,n):
 y,m=divmod(d.year*12+d.month-1+n,12)
 return date(y,m+1,min(d.day,calendar.monthrange(y,m+1)[1]))
def taxed(gross,tax):return int((gross-(gross*D(tax)).to_integral_value(rounding=ROUND_FLOOR)).to_integral_value(rounding=ROUND_FLOOR))
def project(kind,amount,n,rate,model,tax='0.154',start=None,term_days=None):
 if model not in ('simple_monthly','compound_monthly','simple_actual365'):raise ValueError('계산 주기 확인 필요')
 if n<=0 or amount<0:raise ValueError('금액·기간 오류')
 a,r=D(amount),D(rate)/100;start=date.fromisoformat(start) if isinstance(start,str) else start
 periods=[n] if kind=='deposit' else list(range(1,n+1))
 if model=='simple_monthly':gross=sum((a*r*t/12 for t in periods),D(0))
 elif model=='compound_monthly':gross=sum((a*((1+r/12)**t-1) for t in periods),D(0))
 else:
  if start is None:raise ValueError('가입일 필요')
  end=start+timedelta(days=term_days) if term_days else month(start,n)
  payments=[start] if kind=='deposit' else [month(start,i) for i in range(n)]
  gross=sum((a*r*D((end-d).days)/365 for d in payments),D(0))
 principal=amount if kind=='deposit' else amount*n
 return dict(principal=principal,gross_interest=str(gross),net_interest=taxed(gross,tax),gross_balance_ceiling=int((D(principal)+gross).to_integral_value(rounding='ROUND_CEILING')),total=principal+taxed(gross,tax),model=model)

def tier_interest(balance,bands,method):
 """Annual gross at today's rates, not a guaranteed future payout."""
 if not bands:raise ValueError('금액구간 필요')
 if balance<0 or method not in ('marginal','whole_balance'):raise ValueError('금액구간 적용방법 확인 필요')
 previous=0;result=D(0)
 for i,b in enumerate(bands):
  lo,hi=b['lower'],b.get('upper')
  if lo!=previous or (hi is not None and hi<=lo):raise ValueError('금액구간 공백/중복')
  if hi is None and i!=len(bands)-1:raise ValueError('무제한 구간 순서 오류')
  # Bands (lower,upper]; balance zero earns zero.
  if method=='whole_balance' and balance>lo and (hi is None or balance<=hi):return D(balance)*D(b['rate'])/100
  if method=='marginal':result+=D(max(0,min(balance,hi if hi is not None else balance)-lo))*D(b['rate'])/100
  previous=hi
 if bands[-1].get('upper') is not None and balance>bands[-1]['upper']:raise ValueError('상한 초과 금리 미확인')
 return result
