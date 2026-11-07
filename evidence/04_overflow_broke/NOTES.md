# Broke: valid input with huge numbers crashed the solver (HTTP 500)

**Input:** `input.json`. It is the worked example with a 99,999,999.99 L budget and fuel level, and every shop worth 10^12 per hour.

**Earlier version:** the single objective `value * BIG - fuel` reached about 6·10^25, which is beyond 64-bit integers. OR-Tools raised `ValueError: Value out of range: -59999999995000000000000000` and the API returned HTTP 500.

**Fix:**
1. The objectives are lexicographic, so there is no `BIG` multiplier.
2. `validate.py` caps every number at 10^12 and names the field when a number exceeds it. With 12 shops and 10 hours, every sum stays below about 10^14, which is safe.
3. As a last line of defence, a solver exception falls back to the backup solver instead of a 500.

**Fixed output:** `output_fixed.json` (status ok). `input_beyond_limit.json` gives HTTP 400 naming `shops[0].value_per_slot[0]`, in `output_beyond_limit.json`.
