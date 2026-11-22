import Decimal from 'decimal.js';

// Keep all permitted money/weight products exact before rounding to whole đồng.
const MoneyDecimal = Decimal.clone({ precision: 50, rounding: Decimal.ROUND_HALF_UP });
export type DecimalValue = Decimal.Value;
export default MoneyDecimal;
