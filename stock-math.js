/**
 * @file stock-math.js
 * Dependency-free JavaScript port of stock-math.ts for core financial and
 * valuation math. Suitable for stock valuation and exit-planning dashboards
 * (e.g., AMD, NVDA, INTC). Ported faithfully, 2026-09-27. Original authored
 * with assistance from Gemini Pro.
 *
 * Exposed as `window.StockMath` with the same 8 functions:
 * dcfValuation, buildScenarioFCF, sensitivityGrid, trailingStop,
 * rsi, zScoreBands, exitTierPlan, fairValueFromMultiples.
 */
(function () {
    "use strict";

    /**
     * DCF using Gordon Growth terminal value.
     * @throws Error if wacc <= terminalGrowth or sharesOutstanding <= 0.
     */
    function dcfValuation(projectedFCF, wacc, terminalGrowth, netDebt, sharesOutstanding) {
        if (wacc <= terminalGrowth) {
            throw new Error("Invalid assumptions: WACC must be strictly greater than terminal growth rate to calculate Gordon Growth terminal value.");
        }
        if (sharesOutstanding <= 0) {
            throw new Error("Shares outstanding must be greater than zero.");
        }
        var presentValueOfFCF = 0;
        for (var i = 0; i < projectedFCF.length; i++) {
            var year = i + 1;
            presentValueOfFCF += projectedFCF[i] / Math.pow(1 + wacc, year);
        }
        var finalYearFCF = projectedFCF[projectedFCF.length - 1];
        var terminalValue = (finalYearFCF * (1 + terminalGrowth)) / (wacc - terminalGrowth);
        var presentValueOfTV = terminalValue / Math.pow(1 + wacc, projectedFCF.length);
        var enterpriseValue = presentValueOfFCF + presentValueOfTV;
        var equityValue = enterpriseValue - netDebt;
        var perShareFairValue = equityValue / sharesOutstanding;
        return { enterpriseValue: enterpriseValue, equityValue: equityValue, perShareFairValue: perShareFairValue };
    }

    /**
     * Projects annual FCF from a revenue CAGR and margin paths.
     * FCF = NOPAT - Capex - Change in WC, where NOPAT = Revenue * opMargin * (1 - taxRate).
     * @throws Error if margin path lengths do not match `years`.
     */
    function buildScenarioFCF(currentRevenue, revenueCAGR, years, grossMarginPath, opMarginPath, taxRate, capexPctRevenue, wcChangePctRevenue) {
        if (grossMarginPath.length !== years || opMarginPath.length !== years) {
            throw new Error("Margin path arrays must match the specified number of years.");
        }
        var projectedFCF = [];
        var lastRevenue = currentRevenue;
        for (var i = 0; i < years; i++) {
            var revenue = lastRevenue * (1 + revenueCAGR);
            var ebit = revenue * opMarginPath[i];
            var nopat = ebit * (1 - taxRate);
            var capex = revenue * capexPctRevenue;
            var wcChange = revenue * wcChangePctRevenue;
            projectedFCF.push(nopat - capex - wcChange);
            lastRevenue = revenue;
        }
        return projectedFCF;
    }

    /**
     * 2D sensitivity grid of per-share fair value over WACC x terminal growth.
     * Cells where wacc <= terminalGrowth come back as null.
     */
    function sensitivityGrid(baseInputs, waccRange, terminalGrowthRange) {
        return waccRange.map(function (wacc) {
            return terminalGrowthRange.map(function (tg) {
                var fairValue = null;
                if (wacc > tg) {
                    try {
                        var result = dcfValuation(
                            baseInputs.projectedFCF,
                            wacc,
                            tg,
                            baseInputs.netDebt,
                            baseInputs.sharesOutstanding
                        );
                        fairValue = result.perShareFairValue;
                    } catch (e) {
                        fairValue = null;
                    }
                }
                return { wacc: wacc, terminalGrowth: tg, fairValue: fairValue };
            });
        });
    }

    /**
     * Trailing stop: stopLevel = peak * (1 - trailPct); breached if last price <= stop.
     * @throws Error on empty price array.
     */
    function trailingStop(prices, trailPct) {
        if (prices.length === 0) {
            throw new Error("Price array cannot be empty.");
        }
        var peakPrice = -Infinity;
        for (var i = 0; i < prices.length; i++) {
            if (prices[i] > peakPrice) peakPrice = prices[i];
        }
        var stopLevel = peakPrice * (1 - trailPct);
        var currentPrice = prices[prices.length - 1];
        var breached = currentPrice <= stopLevel;
        return { stopLevel: stopLevel, peakPrice: peakPrice, breached: breached };
    }

    /**
     * Wilder's RSI. First `period` elements are NaN. Returns 100 when avg loss is 0.
     */
    function rsi(closes, period) {
        if (period === undefined) period = 14;
        if (closes.length <= period) {
            return closes.map(function () { return NaN; });
        }
        var rsiArray = new Array(closes.length).fill(NaN);
        var sumGain = 0, sumLoss = 0, i;
        for (i = 1; i <= period; i++) {
            var change = closes[i] - closes[i - 1];
            if (change > 0) sumGain += change;
            if (change < 0) sumLoss += Math.abs(change);
        }
        var avgGain = sumGain / period;
        var avgLoss = sumLoss / period;
        if (avgLoss === 0) {
            rsiArray[period] = 100;
        } else {
            var rs = avgGain / avgLoss;
            rsiArray[period] = 100 - (100 / (1 + rs));
        }
        for (i = period + 1; i < closes.length; i++) {
            var c = closes[i] - closes[i - 1];
            var gain = c > 0 ? c : 0;
            var loss = c < 0 ? Math.abs(c) : 0;
            avgGain = ((avgGain * (period - 1)) + gain) / period;
            avgLoss = ((avgLoss * (period - 1)) + loss) / period;
            if (avgLoss === 0) {
                rsiArray[i] = 100;
            } else {
                var r2 = avgGain / avgLoss;
                rsiArray[i] = 100 - (100 / (1 + r2));
            }
        }
        return rsiArray;
    }

    /**
     * Z-score of `current` vs historical `values` (population stddev), with +/-2 sigma flags.
     * @throws Error on empty values array.
     */
    function zScoreBands(values, current) {
        if (values.length === 0) {
            throw new Error("Values array cannot be empty.");
        }
        var mean = values.reduce(function (s, v) { return s + v; }, 0) / values.length;
        var variance = values.reduce(function (s, v) { return s + Math.pow(v - mean, 2); }, 0) / values.length;
        var stddev = Math.sqrt(variance);
        var zScore = 0;
        if (stddev > 0) {
            zScore = (current - mean) / stddev;
        } else {
            zScore = current > mean ? Infinity : current < mean ? -Infinity : 0;
        }
        return { mean: mean, stddev: stddev, zScore: zScore, abovePlus2: zScore > 2, belowMinus2: zScore < -2 };
    }

    /**
     * Rigid exit plan: trims are based on the ORIGINAL position size.
     * @throws Error if total trim % exceeds 100%.
     */
    function exitTierPlan(costBasis, shares, tiers) {
        var totalTrimPct = tiers.reduce(function (s, t) { return s + t.trimPct; }, 0);
        if (totalTrimPct > 1.0001) {
            throw new Error("Total trim percentages sum to " + (totalTrimPct * 100) + "%, which exceeds 100%.");
        }
        var remainingShares = shares;
        var plan = [];
        for (var i = 0; i < tiers.length; i++) {
            var tier = tiers[i];
            var triggerPrice = costBasis * (1 + tier.triggerReturnPct);
            var sharesToTrim = shares * tier.trimPct;
            remainingShares -= sharesToTrim;
            plan.push({
                tierId: i + 1,
                triggerPrice: triggerPrice,
                sharesToTrim: sharesToTrim,
                sharesRemaining: remainingShares < 0.0001 ? 0 : remainingShares
            });
        }
        return plan;
    }

    /**
     * Implied fair value per share from a metric and a multiple.
     * Equity metrics (EPS): fairValueFromMultiples(eps, fwdPE).
     * EV metrics (EBITDA, sales): pass sharesOutstanding and netDebt.
     */
    function fairValueFromMultiples(metric, targetMultiple, sharesOutstanding, netDebt) {
        if (sharesOutstanding === undefined) sharesOutstanding = 1;
        if (netDebt === undefined) netDebt = 0;
        var impliedValue = metric * targetMultiple;
        var equityValue = impliedValue - netDebt;
        return equityValue / sharesOutstanding;
    }

    window.StockMath = {
        dcfValuation: dcfValuation,
        buildScenarioFCF: buildScenarioFCF,
        sensitivityGrid: sensitivityGrid,
        trailingStop: trailingStop,
        rsi: rsi,
        zScoreBands: zScoreBands,
        exitTierPlan: exitTierPlan,
        fairValueFromMultiples: fairValueFromMultiples
    };
})();
