"""Explain returned comparisons without inventing reasons for excluded products."""
def explain_cards(result):
 cards=result.get('cards',[])
 provisional=result.get('provisional',False)
 for index,card in enumerate(cards):
  if provisional:
   summary='아직 확인할 답변이 있어요. 답변에 따라 상품과 순서가 달라질 수 있어요.'
  elif index==0:
   summary='선택한 조건과 같은 저축 예산 안에서 계산한 예상금액이 가장 큰 안이에요.'
   if len(cards)>1 and card['goal_total']==cards[1]['goal_total']:
    summary='선택한 조건에서 예상금액이 같은 안이 있어요. 먼저 표시됐다고 더 유리한 것은 아니에요.'
  else:
   difference=cards[0]['goal_total']-card['goal_total']
   summary=(f'첫 번째 안보다 목표일까지의 예상금액이 {difference:,}원 적어요.' if difference>0
            else '첫 번째 안과 목표일까지의 예상금액이 같아요. 표시 순서는 우열을 뜻하지 않아요.')
  card['comparison_explanation']={
   'summary':summary,
   'scope':'현재 연결된 상품 중 입력한 가입조건·기간·금액·납입 방식에 맞는 안을 비교했어요.',
   'goal':card['goal_notice'],
   'rate_notice':'예상금리는 답변과 선택한 조건을 이행한다는 가정이에요. 실제로 받은 금리는 아니에요.',
   'limit':'만기까지 유지할 확률을 계산한 순위는 아니에요.',
   'provisional':provisional}
