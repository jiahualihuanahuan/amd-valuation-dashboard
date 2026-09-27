/* Valuation & Exit Planning Dashboard — UI wiring.
 * Depends on stock-math.js (window.StockMath). Fully offline; user-entered data
 * persisted to localStorage. Educational tool, not investment advice. */
(function () {
    "use strict";
    var M = window.StockMath;
    var LS_KEY = "vdash1";

    var TICKERS = ["AMD", "NVDA", "AVGO", "MRVL", "INTC", "QCOM", "MU"];
    var PEER_BANDS = { AMD: [30, 45], NVDA: [35, 45], AVGO: [20, 30], MRVL: [30, 45], QCOM: [15, 20], INTC: [10, 20], MU: null };
    var PEER_NOTES = {
        AMD: "primary second-source AI play",
        NVDA: "CUDA premium AI leader",
        AVGO: "custom silicon (ASICs) + networking",
        MRVL: "custom silicon + networking",
        QCOM: "smartphone saturation",
        INTC: "turnaround / value trap, capital intensive",
        MU: "no band in research brief — enter your own"
    };
    var SCEN_DEFAULTS = {
        bull: { cagr: 25, gm: "58,60", om: "30,35", tax: 15, capex: 3, wc: 1, shch: -1.5,
                desc: "Hyper-AI adoption: revenue CAGR 22–28%, gross margin →58–60%, op margin 35%+, buybacks −1 to −2%/yr." },
        base: { cagr: 14, gm: "54,56", om: "28,32", tax: 15, capex: 3, wc: 1, shch: 0,
                desc: "Steady share gain: revenue CAGR 12–16%, margins stable, buybacks offset SBC." },
        bear: { cagr: 6,  gm: "50,52", om: "24,20", tax: 15, capex: 3, wc: 1, shch: 1,
                desc: "Commoditization / capex cut: revenue CAGR 4–8%, margins compress, SBC dilution." }
    };
    var RISKS = [
        { t: "Hyperscaler AI capex peaks", d: "MSFT / Meta / Google / Amazon cut data-center infrastructure spend — AMD's growth engine stalls." },
        { t: "NVIDIA price war", d: "Aggressive Hopper/Blackwell pricing crushes Data Center gross-margin expansion." },
        { t: "US export controls on China", d: "New AI-chip restrictions (e.g. MI308 limits) wipe out projected revenue lines." },
        { t: "ROCm loses to CUDA", d: "AMD's open software stack fails to gain developer traction vs NVIDIA's moat." }
    ];
    var YEARS = 5;

    /* ---------- state ---------- */
    function blankCompany() {
        return { price: "", priceNote: "", eps: "", epsGrowth: "", ebitda: "",
                 revenue: "", shares: "", netdebt: "", target: "", zHist: "",
                 wacc: 9.5, tg: 3.5, scen: JSON.parse(JSON.stringify(SCEN_DEFAULTS)),
                 tiers: [{ ret: 30, trim: 15 }, { ret: 50, trim: 15 }],
                 basis: "", posShares: "", trail: 15, trailHist: "", trailNow: "",
                 bands: JSON.parse(JSON.stringify(PEER_BANDS)),
                 risks: [false, false, false, false] };
    }
    var store = {};
    try { store = JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch (e) { store = {}; }
    TICKERS.forEach(function (t) { if (!store[t]) store[t] = blankCompany(); });
    var cur = store.curTicker && TICKERS.indexOf(store.curTicker) >= 0 ? store.curTicker : "AMD";
    // AMD prefill (only values sourced from the research brief)
    if (!store._amdPrefilled) {
        store.AMD.price = 630.63;
        store.AMD.priceNote = "last known 2026-09-27 (Yahoo Finance chart API)";
        store.AMD.revenue = 25.8; // FY2024
        store._amdPrefilled = true;
    }
    function S() { return store[cur]; }
    function save() { store.curTicker = cur; try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch (e) {} }

    /* ---------- helpers ---------- */
    function $(id) { return document.getElementById(id); }
    function num(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }
    function fmt(v, d) { if (v === null || v === undefined || !isFinite(v)) return "—"; return Number(v).toFixed(d === undefined ? 2 : d); }
    function fmtX(v) { return v === null || !isFinite(v) ? "—" : fmt(v) + "x"; }
    function parseList(txt) {
        return String(txt || "").split(/[,;\s]+/).map(num).filter(function (n) { return n !== null; });
    }
    function parseMarginPath(txt) {
        var parts = parseList(txt);
        if (parts.length === 0) return null;
        var lo = parts[0] / 100, hi = (parts.length > 1 ? parts[1] : parts[0]) / 100;
        var path = [];
        for (var i = 0; i < YEARS; i++) path.push(lo + (hi - lo) * (YEARS === 1 ? 0 : i / (YEARS - 1)));
        return path;
    }
    function marginLabel(txt) { var p = parseList(txt); return p.length ? p.join("→") + "%" : "—"; }

    /* ---------- ticker switcher ---------- */
    function renderTickers() {
        var row = $("tickerRow"); row.innerHTML = "";
        TICKERS.forEach(function (t) {
            var b = document.createElement("button");
            b.textContent = t; if (t === cur) b.className = "active";
            b.onclick = function () { cur = t; save(); renderAll(); };
            row.appendChild(b);
        });
        $("tickerNote").textContent = "Showing: " + cur + " — " + PEER_NOTES[cur] + ". All fields below are editable and saved per ticker.";
    }

    /* ---------- company fields ---------- */
    var FIELDS = ["price", "priceNote", "eps", "epsGrowth", "ebitda", "revenue", "shares", "netdebt", "target"];
    var FIELD_IDS = { price: "f_price", priceNote: "f_priceNote", eps: "f_eps", epsGrowth: "f_epsGrowth",
                      ebitda: "f_ebitda", revenue: "f_revenue", shares: "f_shares", netdebt: "f_netdebt", target: "f_target" };
    function loadCompany() { FIELDS.forEach(function (f) { $(FIELD_IDS[f]).value = S()[f] === null || S()[f] === undefined ? "" : S()[f]; }); }
    function bindCompany() {
        FIELDS.forEach(function (f) {
            $(FIELD_IDS[f]).addEventListener("input", function (e) { S()[f] = e.target.value; save(); renderMultiples(); });
        });
    }

    /* ---------- multiples ---------- */
    function metrics() {
        var s = S(), out = {};
        var price = num(s.price), eps = num(s.eps), g = num(s.epsGrowth),
            ebitda = num(s.ebitda), rev = num(s.revenue), sh = num(s.shares), nd = num(s.netdebt);
        out.fwdPE = (price !== null && eps) ? price / eps : null;
        out.mcap = (price !== null && sh) ? price * sh : null;                 // $B
        out.ev = (out.mcap !== null && nd !== null) ? out.mcap + nd : null;    // $B
        out.evEbitda = (out.ev !== null && ebitda) ? out.ev / ebitda : null;
        out.evSales = (out.ev !== null && rev) ? out.ev / rev : null;
        out.peg = (out.fwdPE !== null && g) ? out.fwdPE / g : null;
        return out;
    }
    function renderMultiples() {
        var m = metrics(), h = "";
        h += '<div class="grid">';
        h += card("Forward P/E", fmtX(m.fwdPE));
        h += card("EV/EBITDA", fmtX(m.evEbitda));
        h += card("EV/Sales", fmtX(m.evSales));
        h += card("PEG", fmt(m.peg));
        h += "</div>";
        var s = S(), t = num(s.target), p = num(s.price);
        if (t !== null && p !== null) {
            var up = (t - p) / p * 100;
            h += '<div class="out">Analyst mean target <b>$' + fmt(t) + "</b> → implied <b class=\"" +
                 (up >= 0 ? "pos" : "neg") + "\">" + (up >= 0 ? "+" : "") + fmt(up, 1) + "%</b> vs current price.</div>";
        }
        $("multOut").innerHTML = h;
        renderPeers(m); renderZ(m);
    }
    function card(lbl, val) { return '<div class="out"><label>' + lbl + '</label><div class="big">' + val + "</div></div>"; }

    function renderPeers(m) {
        var h = '<table><tr><th>Peer</th><th>Fwd P/E band</th><th>Your fwd P/E</th><th>Band position</th><th>Note</th></tr>';
        TICKERS.forEach(function (t) {
            var b = S().bands[t];
            var own = (t === cur) ? m.fwdPE : null;
            var pos = "—", cls = "";
            if (b && own !== null && isFinite(own)) {
                if (own < b[0]) { pos = "below band (cheap vs history)"; cls = "pos"; }
                else if (own > b[1]) { pos = "ABOVE band (expensive vs history)"; cls = "neg"; }
                else { pos = "inside band"; cls = "amber"; }
            }
            h += "<tr><td><b>" + t + "</b></td><td>" +
                 '<input type="number" step="any" data-band="' + t + '" data-idx="0" value="' + (b ? b[0] : "") + '" style="width:52px;display:inline"> – ' +
                 '<input type="number" step="any" data-band="' + t + '" data-idx="1" value="' + (b ? b[1] : "") + '" style="width:52px;display:inline"></td><td>' +
                 (own !== null ? fmtX(own) : "—") + '</td><td class="' + cls + '">' + pos + "</td><td>" + PEER_NOTES[t] + "</td></tr>";
        });
        h += "</table><p class=\"note\">Bands are editable starting guesses from the research brief. Fill each company's fundamentals (section 1) to compare actual multiples.</p>";
        $("peerTable").innerHTML = h;
        var inputs = $("peerTable").querySelectorAll("input[data-band]");
        inputs.forEach(function (inp) {
            inp.addEventListener("input", function () {
                var t = inp.getAttribute("data-band"), i = +inp.getAttribute("data-idx");
                if (!S().bands[t]) S().bands[t] = [null, null];
                S().bands[t][i] = num(inp.value);
                save();
            });
        });
    }

    function renderZ(m) {
        var metric = $("z_metric").value;
        var hist = parseList($("z_hist").value);
        var curVal = metric === "pe" ? m.fwdPE : metric === "evebitda" ? m.evEbitda : m.evSales;
        var h = "";
        if (hist.length >= 2 && curVal !== null && isFinite(curVal)) {
            try {
                var z = M.zScoreBands(hist, curVal);
                var flag = z.abovePlus2 ? '<span class="neg"><b>ABOVE +2σ — stretched</b></span>'
                         : z.belowMinus2 ? '<span class="pos"><b>BELOW −2σ — compressed</b></span>'
                         : '<span class="amber">within ±2σ</span>';
                h = '<div class="out">Current ' + metricLabel(metric) + " <b>" + fmtX(curVal) + "</b> vs history mean " + fmt(z.mean) +
                    " (σ=" + fmt(z.stddev) + "): z = <b>" + fmt(z.zScore) + "</b> → " + flag + "</div>";
            } catch (e) { h = '<div class="out note">' + e.message + "</div>"; }
        } else {
            h = '<div class="out note">Enter a history (2+ values) in section 1/2 and fill the fundamentals above to compute a z-score.</div>';
        }
        $("zOut").innerHTML = h;
    }
    function metricLabel(k) { return k === "pe" ? "forward P/E" : k === "evebitda" ? "EV/EBITDA" : "EV/Sales"; }

    /* ---------- DCF ---------- */
    var scen = "base";
    function bindScenTabs() {
        var tabs = $("scenTabs").querySelectorAll("button");
        tabs.forEach(function (b) {
            b.onclick = function () {
                scen = b.getAttribute("data-s");
                tabs.forEach(function (x) { x.className = x.getAttribute("data-s") === scen ? "active" : ""; });
                loadScen(); renderDCF();
            };
        });
    }
    function loadScen() {
        var sc = S().scen[scen];
        $("s_cagr").value = sc.cagr; $("s_gm").value = sc.gm; $("s_om").value = sc.om;
        $("s_tax").value = sc.tax; $("s_capex").value = sc.capex; $("s_wc").value = sc.wc; $("s_shch").value = sc.shch;
        $("s_wacc").value = S().wacc; $("s_tg").value = S().tg;
        $("waccLbl").textContent = fmt(S().wacc, 2) + "%"; $("tgLbl").textContent = fmt(S().tg, 2) + "%";
        $("scenDesc").textContent = sc.desc;
    }
    function bindScen() {
        ["s_cagr", "s_gm", "s_om", "s_tax", "s_capex", "s_wc", "s_shch"].forEach(function (id) {
            $(id).addEventListener("input", function (e) {
                var k = { s_cagr: "cagr", s_gm: "gm", s_om: "om", s_tax: "tax", s_capex: "capex", s_wc: "wc", s_shch: "shch" }[id];
                S().scen[scen][k] = (id === "s_gm" || id === "s_om") ? e.target.value : num(e.target.value);
                save(); renderDCF();
            });
        });
        $("s_wacc").addEventListener("input", function (e) { S().wacc = num(e.target.value); $("waccLbl").textContent = fmt(S().wacc, 2) + "%"; save(); renderDCF(); });
        $("s_tg").addEventListener("input", function (e) { S().tg = num(e.target.value); $("tgLbl").textContent = fmt(S().tg, 2) + "%"; save(); renderDCF(); });
    }
    function currentDCF() {
        var s = S(), sc = s.scen[scen];
        var rev = num(s.revenue), sh = num(s.shares), nd = num(s.netdebt);
        if (rev === null || sh === null || nd === null) return { err: "Fill revenue, shares outstanding and net debt in section 1 to run the DCF." };
        var gm = parseMarginPath(sc.gm), om = parseMarginPath(sc.om);
        if (!gm || !om) return { err: "Enter margin paths like “54,56”." };
        var cagr = num(sc.cagr), tax = num(sc.tax), capex = num(sc.capex), wc = num(sc.wc), shch = num(sc.shch);
        if (cagr === null || tax === null || capex === null || wc === null || shch === null)
            return { err: "Fill all scenario inputs (CAGR, margins, tax, capex, WC, share change)." };
        var wacc = s.wacc / 100, tg = s.tg / 100;
        try {
            var fcf = M.buildScenarioFCF(rev, cagr / 100, YEARS, gm, om, tax / 100, capex / 100, wc / 100);
            var shEnd = sh * Math.pow(1 + shch / 100, YEARS);
            var r = M.dcfValuation(fcf, wacc, tg, nd, shEnd);
            return { fcf: fcf, fair: r.perShareFairValue, ev: r.enterpriseValue, shEnd: shEnd, wacc: wacc, tg: tg, nd: nd };
        } catch (e) { return { err: e.message }; }
    }
    function renderDCF() {
        var d = currentDCF(), h = "";
        if (d.err) { $("dcfOut").innerHTML = '<div class="out note">' + d.err + "</div>"; $("sensGrid").innerHTML = ""; return; }
        var price = num(S().price);
        var up = price !== null && price > 0 ? (d.fair - price) / price * 100 : null;
        h += '<div class="grid">';
        h += card(scenLabel() + " fair value /share", "$" + fmt(d.fair));
        h += card("Implied upside", up === null ? "—" : '<span class="' + (up >= 0 ? "pos" : "neg") + '">' + (up >= 0 ? "+" : "") + fmt(up, 1) + "%</span>");
        h += card("Enterprise value", "$" + fmt(d.ev, 1) + "B");
        h += "</div>";
        h += '<p class="note">5-yr FCF ($B): ' + d.fcf.map(function (f) { return fmt(f, 2); }).join(" → ") +
             " · shares at yr-5: " + fmt(d.shEnd, 2) + "B · WACC " + fmt(d.wacc * 100, 2) + "%, g " + fmt(d.tg * 100, 2) + "%</p>";
        $("dcfOut").innerHTML = h;
        // sensitivity grid
        var w = S().wacc / 100, g = S().tg / 100;
        var wr = [], gr = [];
        for (var i = -2; i <= 2; i++) wr.push(Math.max(4, (S().wacc + i * 0.5)) / 100);
        for (var j = -2; j <= 2; j++) gr.push(Math.max(0.5, (S().tg + j * 0.5)) / 100);
        var grid = M.sensitivityGrid({ projectedFCF: d.fcf, netDebt: d.nd, sharesOutstanding: d.shEnd }, wr, gr);
        var t = '<div style="overflow-x:auto"><table><tr><th>WACC \\ g</th>';
        gr.forEach(function (x) { t += "<th>" + fmt(x * 100, 1) + "%</th>"; });
        t += "</tr>";
        grid.forEach(function (row) {
            t += "<tr><td><b>" + fmt(row[0].wacc * 100, 1) + "%</b></td>";
            row.forEach(function (c) {
                var v = c.fairValue;
                var cls = "";
                if (v !== null && price) { cls = v > price * 1.1 ? "pos" : v < price * 0.9 ? "neg" : "amber"; }
                t += '<td class="' + cls + '">' + (v === null ? "n/a" : "$" + fmt(v, 0)) + "</td>";
            });
            t += "</tr>";
        });
        $("sensGrid").innerHTML = t + "</table></div>";
    }
    function scenLabel() { return scen.charAt(0).toUpperCase() + scen.slice(1); }

    /* ---------- exit plan ---------- */
    function renderTiers() {
        var box = $("tierRows"); box.innerHTML = "";
        S().tiers.forEach(function (tr, i) {
            var row = document.createElement("div"); row.className = "tierrow";
            row.innerHTML =
                '<div class="field"><label>Trigger return %</label><input type="number" step="any" value="' + tr.ret + '" data-t="' + i + '" data-k="ret"></div>' +
                '<div class="field"><label>Trim %</label><input type="number" step="any" value="' + tr.trim + '" data-t="' + i + '" data-k="trim"></div>' +
                '<div class="btnrow"><button data-del="' + i + '">✕</button></div>';
            box.appendChild(row);
        });
        box.querySelectorAll("input").forEach(function (inp) {
            inp.addEventListener("input", function () {
                S().tiers[+inp.getAttribute("data-t")][inp.getAttribute("data-k")] = num(inp.value);
                save(); renderExit();
            });
        });
        box.querySelectorAll("button[data-del]").forEach(function (b) {
            b.onclick = function () { S().tiers.splice(+b.getAttribute("data-del"), 1); save(); renderTiers(); renderExit(); };
        });
    }
    function renderExit() {
        var s = S(), h = "";
        var basis = num(s.basis), shares = num(s.posShares);
        if (basis !== null && shares !== null && s.tiers.length) {
            try {
                var plan = M.exitTierPlan(basis, shares,
                    s.tiers.map(function (t) { return { triggerReturnPct: (num(t.ret) || 0) / 100, trimPct: (num(t.trim) || 0) / 100 }; }));
                h += '<table><tr><th>Tier</th><th>Trigger price</th><th>Trim shares</th><th>Proceeds</th><th>Remaining</th></tr>';
                var total = 0;
                plan.forEach(function (p) {
                    var proc = p.sharesToTrim * p.triggerPrice; total += proc;
                    h += "<tr><td>" + p.tierId + "</td><td>$" + fmt(p.triggerPrice) + "</td><td>" + fmt(p.sharesToTrim, 1) +
                         "</td><td>$" + fmt(proc, 0) + "</td><td>" + fmt(p.sharesRemaining, 1) + "</td></tr>";
                });
                h += "</table><div class=\"out\">Total proceeds at full plan: <b>$" + fmt(total, 0) + "</b> · cost of position: $" + fmt(basis * shares, 0) + "</div>";
            } catch (e) { h += '<div class="out note">' + e.message + "</div>"; }
        } else {
            h += '<div class="out note">Enter cost basis and shares, and define at least one tier.</div>';
        }
        $("tierOut").innerHTML = h;
        // trailing stop
        var trail = num(s.trail), hist = parseList(s.trailHist), nowP = num(s.trailNow), t2 = "";
        if (trail !== null && hist.length) {
            try {
                var r = M.trailingStop(hist, trail / 100);
                t2 += '<div class="out">Peak <b>$' + fmt(r.peakPrice) + "</b> → stop level <b>$" + fmt(r.stopLevel) + "</b> (" + fmt(trail, 1) + "% trail)</div>";
                if (nowP !== null) {
                    if (nowP <= r.stopLevel) t2 += '<div class="out neg"><b>STOP BREACHED</b> — $' + fmt(nowP) + " is at/below $" + fmt(r.stopLevel) + ".</div>";
                    else t2 += '<div class="out pos">Price $' + fmt(nowP) + " is <b>" + fmt((nowP - r.stopLevel) / r.stopLevel * 100, 1) + "% above</b> the stop.</div>";
                }
            } catch (e) { t2 += '<div class="out note">' + e.message + "</div>"; }
        } else {
            t2 = '<div class="out note">Enter trail % and a price history to compute the stop level.</div>';
        }
        $("trailOut").innerHTML = t2;
    }
    function bindExit() {
        $("x_basis").addEventListener("input", function (e) { S().basis = e.target.value; save(); renderExit(); });
        $("x_shares").addEventListener("input", function (e) { S().posShares = e.target.value; save(); renderExit(); });
        $("t_trail").addEventListener("input", function (e) { S().trail = e.target.value; save(); renderExit(); });
        $("t_hist").addEventListener("input", function (e) { S().trailHist = e.target.value; save(); renderExit(); });
        $("t_now").addEventListener("input", function (e) { S().trailNow = e.target.value; save(); renderExit(); });
        $("addTier").onclick = function () { S().tiers.push({ ret: 75, trim: 10 }); save(); renderTiers(); renderExit(); };
        $("resetTiers").onclick = function () { S().tiers = [{ ret: 30, trim: 15 }, { ret: 50, trim: 15 }]; save(); renderTiers(); renderExit(); };
    }
    function loadExit() {
        $("x_basis").value = S().basis; $("x_shares").value = S().posShares;
        $("t_trail").value = S().trail; $("t_hist").value = S().trailHist; $("t_now").value = S().trailNow;
    }

    /* ---------- risks ---------- */
    function renderRisks() {
        var box = $("riskList"); box.innerHTML = "";
        var any = false;
        RISKS.forEach(function (r, i) {
            var on = S().risks[i];
            if (on) any = true;
            var d = document.createElement("div"); d.className = "risk";
            d.innerHTML = '<input type="checkbox" ' + (on ? "checked" : "") + ' data-r="' + i + '">' +
                          '<div><div class="rt">' + r.t + "</div><div class=\"rd\">" + r.d + "</div></div>";
            box.appendChild(d);
        });
        box.querySelectorAll("input").forEach(function (c) {
            c.addEventListener("change", function () { S().risks[+c.getAttribute("data-r")] = c.checked; save(); renderRisks(); });
        });
        if (any) {
            var w = document.createElement("div"); w.className = "warnbox";
            w.innerHTML = "<b>⚠ Thesis check:</b> at least one invalidation risk is flagged as materializing. Re-run the DCF under the bear scenario.";
            box.appendChild(w);
        }
    }

    /* ---------- z-score persistence ---------- */
    function loadZ() { $("z_hist").value = S().zHist || ""; }
    function bindZ() {
        $("z_hist").addEventListener("input", function (e) { S().zHist = e.target.value; save(); renderMultiples(); });
        $("z_metric").addEventListener("change", renderMultiples);
    }

    /* ---------- boot ---------- */
    function renderAll() {
        renderTickers(); loadCompany(); loadScen(); loadExit(); loadZ();
        renderTiers(); renderMultiples(); renderDCF(); renderExit(); renderRisks();
    }
    bindCompany(); bindScenTabs(); bindScen(); bindExit(); bindZ();
    renderAll();
})();
