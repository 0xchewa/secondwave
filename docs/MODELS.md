# Models and Reproducibility

## Included components

As of September 19, 2026, the SHA-256 values of three artifacts have been verified against the active model files. The [manifest](../models/manifest.json) records their weights and source files. Pure functions for Early features, GBDT inference, explanations, the Wave detector, and Wave24 replay were ported without changing their numerical logic. File-session and RPC adapters were written for this console.

| Component | Input | Local result |
| --- | --- | --- |
| Early Signal | 23 causal features at launch time | MODEL ESTIMATE, secondary TOP, and feature contributions |
| Second Wave | Verified migration, ordered trades, and coverage | Stage, scenario boundaries, deadline, and outcome |
| Wave probability artifact | 14 features | Preserved, but the probability gate is disabled |
| Experimental peak range | Early vector and 200 trees | Range with residual quartiles, minimum 1× |

## Early Signal

The primary value matches Terminal: `MODEL ESTIMATE = sigmoid(a × logit(predict(model, x)) + b)`, where the coefficients come from `liveCalibration` in the active artifact. The clamp before logit is `[1e-9, 1-1e-9]`. This is an experimental model estimate; the approved-probability flag is not enabled.

Secondary TOP is calculated against a frozen reference population, not the rows currently displayed. TOP 65% does not mean a 65% probability of migration. The Early horizon is four hours. The current estimate is hidden after migration, window expiry, a reorg, or collector lag above 90 seconds. The historical result is preserved separately. An unsupported quote currency or missing causal vector is not converted into a numeric estimate.

Accumulated history belongs to the **factory caller**, which may differ from the token's final creator. The seed preserves preceding launch/graduation counts, exemption intersections, and recent factory launches. Every new launch uses the state from before that event.

## Second Wave

Move → pullback → base → scenario. Observable stages exist independently of the probability model. Target and invalidation belong to a specific estimate with its timestamp and horizon; later events are evaluated in block/log order. Crossing the lower boundary before the upper move is confirmed records a failure.

Coverage is verified independently of trade count. An empty but fully inspected interval differs from a history gap. Checkpoint continuation uses the same engine state as sequential replay. The chart and flow show the stored interval; a small tail is not presented as the token's complete trade history.

Approved Early and Wave probability gates are disabled. Early displays the same experimental numeric estimate as Terminal; Wave primarily reports the observed stage and scenario. This release does not waive the release gates.

## Dated research

[data/evidence.json](../data/evidence.json) is a preserved evaluation from September 16, not a current market census. Early: train/calibration/test 89,671 / 71,486 / 76,827; ROC-AUC 0.745750; top-decile lift 4.12×. The inspected test remains diagnostic.

Wave: expanded dataset of 310 independent tokens; 88 impulse, 211 breakdown, and 11 unresolved. The new uninspected test contains 41 tokens and 9 positives, below the minimum of 10. The expanded candidate is not active. The 39,605 tokens in the current bootstrap are market inputs for operation, not a new evaluation sample.

## Verification

```sh
node scripts/model-record.mjs
npm run models
npm run bench
npm test
```

The benchmark verifies artifact and recorded-input SHA values, then checks 882 Early/peak numerical assertions. An additional test reproduces the stored estimate and TOP for 40 real launch vectors with exact equality. Wave is covered by tests for causal replay, restart, coverage, and outcome ordering. Zero deviation in a parity test demonstrates implementation parity, not predictive accuracy.

Weights, inference, and reproducibility data are included. The full raw archive and complete training pipeline are not published here. Required attribution notices and compatible internal artifact identifiers are preserved in [THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md).
