export function reconcileCarrier({expectedCents,carrierCents,ratedCostCents}){
  for(const value of [expectedCents,carrierCents,ratedCostCents])
    if(!Number.isSafeInteger(value)||value<0)throw new RangeError('Invalid carrier amount');
  return {statementVarianceCents:carrierCents-expectedCents,
    ratedVarianceCents:carrierCents-ratedCostCents,
    matched:carrierCents===expectedCents&&carrierCents===ratedCostCents};
}
