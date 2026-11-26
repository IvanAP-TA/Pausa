// The landing's own stylesheet. The page ships NO JavaScript, so everything that legacy did with a script is CSS here:
//   theme toggle   a hidden checkbox + `:root:has(:checked)` (valid on this page only: no cookie can be written)
//   Serata demo    radio groups + `:has()` (a three-step state machine), "Ricomincia" is a form reset
//   FAQ, install   <details>
//   progress line, reveal, how-it-works crossfade, sticky CTA   `animation-timeline: scroll()/view()`, only under
//                  @supports and prefers-reduced-motion: no-preference; without support the page is simply static
import { colorNames, cssVar, fonts, palettes } from "@/theme";

const light = `${colorNames.map((n) => `${cssVar(n)}:${palettes.light[n]}`).join(";")};color-scheme:light;--safelight:7%;--curtain:5%;--grain:.12`;
const D = fonts.display200;
const D4 = fonts.display400;
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 9 -4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E\") 0 0 / 200px 200px";
const EASE = "cubic-bezier(0.16,1,0.3,1)";
const CARD_GROUND = palettes.dark.paper;
const CARD_INK = palettes.dark.ink;
const CARD_MUTED = palettes.dark.muted;
const CARD_RULE = palettes.dark.rule;
const CARD_ACCENT = palettes.dark.accent;

export const LANDING_CSS = `
:root:has(.lp-theme:checked){${light}}
:root:has(.lp-theme:checked) .lp-grained::after{filter:invert(1)}
:root:has(.lp){scroll-padding-top:5rem}
@media (prefers-reduced-motion:no-preference){:root:has(.lp){scroll-behavior:smooth}}
.lp{--container:1440px;--gutter:64px;--gap:32px;--sg-s:120px;--sg:144px;--sg-l:176px;position:relative;z-index:1;display:block;width:100%;font-family:Barlow_400,ui-sans-serif,system-ui,sans-serif;font-size:16px;line-height:1.55;color:var(--c-ink);font-synthesis:none}
@media (max-width:60rem){.lp{--gutter:24px;--sg-s:80px;--sg:96px;--sg-l:120px}}
@media (max-width:40rem){.lp{--gutter:16px;--sg-s:56px;--sg:72px;--sg-l:96px;--gap:16px}}
.lp *,.lp *::before,.lp *::after{box-sizing:border-box}
.lp h1,.lp h2,.lp h3,.lp p,.lp ul,.lp ol,.lp figure{margin:0;padding:0}
.lp ul,.lp ol{list-style:none}
:where(.lp) a{color:inherit;text-decoration:none}
.lp strong{font-family:Barlow_600,ui-sans-serif,sans-serif;font-weight:400}
.lp img{display:block;max-width:100%}
.lp svg{flex:none}
.lp-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.lp-wrap{width:100%;max-width:var(--container);margin:0 auto;padding:0 var(--gutter)}
.lp-cols{display:grid;column-gap:var(--gap)}
@media (min-width:64rem){.lp-cols{grid-template-columns:repeat(12,minmax(0,1fr))}.lp-s3{grid-column:span 3}.lp-s4{grid-column:span 4}.lp-s5{grid-column:span 5}.lp-s6{grid-column:span 6}.lp-s7{grid-column:span 7}.lp-s8{grid-column:span 8}.lp-st5{grid-column-start:5}.lp-st6{grid-column-start:6}.lp-st7{grid-column-start:7}.lp-st9{grid-column-start:9}}
.lp-min0{min-width:0}
.lp-head{font-family:${D},ui-sans-serif,sans-serif;font-weight:200;font-size:clamp(2.75rem,6.5vw,5.5rem);line-height:1.02;text-transform:uppercase;letter-spacing:-.005em;text-wrap:balance;overflow-wrap:break-word}
.lp-lead{font-family:Barlow_300,ui-sans-serif,sans-serif;font-size:1.2rem;line-height:1.4;color:var(--c-ink2)}
.lp-title{font-family:${D4},ui-sans-serif,sans-serif;font-size:2rem;line-height:1.02;text-transform:uppercase;letter-spacing:-.005em;overflow-wrap:break-word;min-width:0}
.lp-figure{font-family:${D},ui-sans-serif,sans-serif;font-weight:200;line-height:1;font-variant-numeric:lining-nums proportional-nums}
.lp-poster{font-size:clamp(2.75rem,6.5vw,5.5rem)}
.lp-muted{color:var(--c-muted)}.lp-ink2{color:var(--c-ink2)}.lp-sm{font-size:.875rem}
.lp-tab{font-variant-numeric:tabular-nums}
.lp-well{background:var(--c-paper2)}
.lp-grained{position:relative;isolation:isolate}
.lp-grained::after{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;opacity:var(--grain);background:${GRAIN}}
.lp-plate{border-top:1px solid var(--c-rule)}
.lp-rows>*{border-top:1px solid var(--c-rule)}.lp-rows>*:last-child{border-bottom:1px solid var(--c-rule)}
.lp-sec{scroll-margin-top:4rem}

/* controls */
.lp-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 24px;border:1px solid var(--c-ink);background:transparent;color:var(--c-ink);font-family:${D4},ui-sans-serif,sans-serif;font-size:1.2rem;line-height:1;text-transform:uppercase;letter-spacing:.02em;white-space:nowrap;cursor:pointer;transition:background-color 120ms ${EASE},border-color 120ms ${EASE},color 120ms ${EASE},transform 120ms ${EASE}}
.lp-btn:hover{background:var(--c-paper3)}.lp-btn:active{transform:scale(.97)}
.lp-btn-primary{background:var(--c-accent);border-color:var(--c-accent);color:var(--c-accentInk)}
.lp-btn-primary:hover{background:var(--c-accentHover);border-color:var(--c-accentHover)}
.lp-btn-quiet{border-color:var(--c-rule);color:var(--c-ink2)}
.lp-btn-quiet:hover{border-color:var(--c-muted);color:var(--c-ink);background:transparent}
.lp-btn-lg{min-height:52px;padding:0 40px;font-size:1.44rem}
.lp-btn-block{width:100%}@media (min-width:40rem){.lp-btn-block{width:fit-content}}
.lp-link{color:var(--c-ink);text-decoration:underline;text-decoration-color:var(--c-muted);text-underline-offset:.2em}
.lp-link:hover{text-decoration-color:var(--c-accent)}
.lp-ctl:has(:focus-visible),.lp-btn:focus-visible,.lp-a:focus-visible,.lp-pick:has(:focus-visible){outline:2px solid var(--c-focus);outline-offset:2px}
.lp-a{display:inline-flex;align-items:center;min-height:44px;white-space:nowrap;transition:color 150ms}
.lp-a:hover{color:var(--c-ink)}

/* header */
.lp-header{position:sticky;top:env(safe-area-inset-top,0px);z-index:30;border-bottom:1px solid var(--c-rule);background:var(--c-paper)}
.lp-bar{display:flex;align-items:center;gap:16px;height:64px}
.lp-brand{display:flex;align-items:center;gap:10px;min-height:44px}
.lp-brand span{font-family:${D4},ui-sans-serif,sans-serif;font-size:2.074rem;line-height:1;text-transform:uppercase}
.lp-nav{display:none;align-items:center;gap:28px;margin-left:32px;font-size:.875rem;color:var(--c-muted)}
@media (min-width:64rem){.lp-nav{display:flex}}
.lp-tools{display:flex;align-items:center;margin-left:auto;gap:0}
@media (min-width:40rem){.lp-tools{gap:16px}}
.lp-langs{display:flex;align-items:center;font-size:.875rem}
.lp-lang{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:32px;color:var(--c-muted);text-transform:uppercase;text-underline-offset:8px;transition:color 150ms}
@media (min-width:40rem){.lp-lang{min-width:36px}}
.lp-lang:hover{color:var(--c-ink)}
.lp-lang[aria-current]{color:var(--c-ink);text-decoration:underline;text-decoration-color:var(--c-accent)}
.lp-theme-btn{display:grid;place-items:center;width:44px;height:44px;color:var(--c-ink2);cursor:pointer;position:relative;transition:color 150ms,background-color 150ms}
@media (max-width:40rem){.lp-theme-btn{width:36px}}
.lp-theme-btn:hover{background:var(--c-paper2);color:var(--c-ink)}
.lp-login{display:none;padding:0 4px;font-size:.875rem;color:var(--c-muted)}
@media (min-width:40rem){.lp-login{display:inline-flex}}
.lp-start{padding:0 16px;min-height:44px;font-size:1.2rem}
.lp-progress{position:absolute;left:0;right:0;bottom:-1px;height:2px;background:var(--c-accent);transform:scaleX(0);transform-origin:left;pointer-events:none}

/* hero */
.lp-hero{display:grid;padding:32px 0;overflow-x:clip}
@media (min-width:64rem){.lp-hero{min-height:calc(100svh - 4rem);align-content:center}}
.lp-hero-grid{align-items:center;row-gap:48px}
.lp-hero h1{font-family:${D},ui-sans-serif,sans-serif;font-weight:200;line-height:1;text-transform:uppercase;letter-spacing:-.005em;text-wrap:balance;font-size:clamp(3.5rem,16.5svh,clamp(4rem,13vw,11rem));overflow-wrap:break-word}
.lp-rise{animation:lp-rise 420ms ${EASE} both;animation-delay:var(--d,0ms)}
@keyframes lp-rise{from{opacity:.4;transform:translateY(12px)}to{opacity:1;transform:none}}
.lp-hero-actions{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:28px}
.lp-note{margin-top:16px;max-width:28rem;font-size:.875rem;color:var(--c-muted)}

/* mocks */
.lp-mock{text-align:left}
.lp-mlog{display:grid;grid-template-columns:96px minmax(0,1fr);column-gap:16px;row-gap:12px;padding:16px 0;border-top:1px solid var(--c-rule)}
.lp-mwho{grid-column:1/-1;display:flex;align-items:center;gap:8px;font-size:.875rem;color:var(--c-muted)}
.lp-mwho strong{color:var(--c-ink)}
.lp-av{display:inline-grid;place-items:center;width:var(--s,28px);height:var(--s,28px);border-radius:50%;background:var(--t);color:var(--c-onTint);font-family:${D4},ui-sans-serif,sans-serif;font-size:calc(var(--s,28px)*.48);line-height:1;text-transform:uppercase}
.lp-pic{position:relative;width:100%;aspect-ratio:2/3;background:var(--c-paper3);overflow:hidden}
.lp-pic img{width:100%;height:100%;object-fit:cover}
.lp-mmeta{display:grid;align-content:start;gap:6px;min-width:0}
.lp-mmeta .lp-title{font-size:1.5rem}
.lp-tag{display:inline-flex;align-items:center;min-height:24px;padding:0 8px;border:1px solid var(--c-rule);font-size:.875rem;color:var(--c-ink2)}
.lp-with{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:4px}
.lp-review{grid-column:1/-1;font-family:Barlow_300,ui-sans-serif,sans-serif;font-size:1.2rem;line-height:1.4;color:var(--c-ink)}
.lp-stars{position:relative;display:inline-block;width:80px;height:16px;margin-top:4px}
.lp-stars>span{position:absolute;left:0;top:0;height:16px;overflow:hidden;white-space:nowrap;display:flex}
.lp-stars>span:first-child{width:100%;color:var(--c-rule)}
.lp-stars>span:last-child{width:90%;color:var(--c-accent)}
.lp-stars svg{fill:currentColor;stroke:none}
.lp-mhead{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,132px);border-top:1px solid var(--c-rule)}
@media (max-width:40rem){.lp-mhead{grid-template-columns:minmax(0,1fr)}.lp-mhead>.lp-mres{display:none}}
.lp-mmatch{display:grid;align-content:start;gap:12px;padding:16px 16px 16px 0}
.lp-mres{border-left:1px solid var(--c-rule);padding:16px 0 16px 16px}
.lp-mrow{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.lp-mmatch .lp-title{font-size:1.5rem}
.lp-segs{display:flex;gap:4px}.lp-segs i{display:block;height:2px;flex:1;background:var(--c-rule)}
.lp-segs i.on{background:var(--c-ink)}.lp-segs i.now{background:var(--c-accent)}
.lp-vs3{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:start;gap:8px}
.lp-vs3 .lp-vs{align-self:center;font-family:${D4},ui-sans-serif,sans-serif;font-size:1.2rem;text-transform:uppercase;color:var(--c-muted)}
.lp-mfilm{display:grid;gap:6px;border:2px solid transparent}.lp-mfilm.sel{border-color:var(--c-accent)}
.lp-mfilm span{padding:0 4px 4px;font-size:.875rem;font-weight:600;line-height:1.2;font-family:Barlow_600,ui-sans-serif,sans-serif}
.lp-mpeople{display:flex;align-items:center;gap:6px;color:var(--c-muted)}
.lp-minvite{display:grid;gap:12px;padding:24px;background:var(--c-paper2);text-align:left}
.lp-minvite .lp-btn{margin-top:8px;width:fit-content}

/* the card (9:16), sized from its own width */
.lp-card{container-type:inline-size;width:100%}
.lp-card-in{display:flex;flex-direction:column;aspect-ratio:9/16;border:1px solid ${CARD_RULE};background:${CARD_GROUND};overflow:hidden;text-align:left}
.lp-card-pic{flex:1;min-height:40%;background:${CARD_RULE};overflow:hidden}
.lp-card-pic img{width:100%;height:100%;object-fit:cover}
.lp-card-body{padding:5cqw 6cqw;display:grid;gap:2.4cqw}
.lp-card-t{margin:0;font-family:${D},ui-sans-serif,sans-serif;font-weight:200;text-transform:uppercase;line-height:.98;color:${CARD_INK};text-wrap:balance;overflow-wrap:break-word;font-size:19cqw}
.lp-card-t.m{font-size:14cqw}.lp-card-t.l{font-size:11cqw}
.lp-card-sub{margin:0;font-family:Barlow_300,ui-sans-serif,sans-serif;font-size:max(7px,4.6cqw);line-height:1.25;color:${CARD_INK}}
.lp-card-row{margin:0;border-top:1px solid ${CARD_RULE};padding:1.6cqw 0;font-size:max(6.5px,3.8cqw);line-height:1.3;color:${CARD_MUTED};font-variant-numeric:tabular-nums}
.lp-card-foot{display:flex;align-items:center;justify-content:space-between;border-top:1px solid ${CARD_RULE};padding-top:2.4cqw;font-size:max(6px,3.4cqw);color:${CARD_MUTED}}
.lp-card-bars{display:flex;gap:.8cqw}.lp-card-bars i{display:block;width:1.1cqw;height:3.4cqw;background:${CARD_ACCENT}}

/* problem, how */
.lp-problem{padding:var(--sg-s) 0}
.lp-problem .lp-cols{margin-top:40px}@media (min-width:64rem){.lp-problem .lp-cols{margin-top:56px}}
.lp-problem p.lp-lead{max-width:56ch}
.lp-how{padding:var(--sg) 0 var(--sg-l)}
.lp-how-grid{display:grid;gap:40px var(--gap);margin-top:48px;timeline-scope:--step1,--step2,--step3}
@media (min-width:64rem){.lp-how-grid{grid-template-columns:repeat(12,minmax(0,1fr));margin-top:16px}.lp-how-steps{grid-column:span 7}.lp-how-side{grid-column:9/span 4}}
.lp-how-steps{display:grid;gap:56px}
.lp-step{display:grid;gap:24px}
.lp-step-row{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:24px;row-gap:8px;align-items:start;border-top:1px solid var(--c-rule);padding-top:20px}
@media (min-width:64rem){.lp-step-row{column-gap:40px}}
.lp-step p{margin-top:12px;max-width:46ch;color:var(--c-ink2)}
.lp-step .lp-figure{color:var(--c-ink)}
.lp-step-vis{width:100%;max-width:380px}
.lp-how-side{display:none;position:relative}
.lp-how-pin{position:sticky;top:7rem;height:min(600px,64svh)}
.lp-how-vis{position:absolute;inset:0;display:grid;align-content:center}
/* the sticky crossfade exists only where it can be driven by scroll; elsewhere each step carries its own picture */
@supports (animation-timeline:view()){@media (min-width:64rem) and (prefers-reduced-motion:no-preference){
.lp-step-vis{display:none}
.lp-how-side{display:block}
.lp-how-steps{gap:0}.lp-step{min-height:64svh;align-content:center}
.lp-s1{view-timeline:--step1 block}.lp-s2{view-timeline:--step2 block}.lp-s3{view-timeline:--step3 block}
.lp-how-vis{opacity:0;animation:lp-vis linear both;animation-range:cover 0% cover 100%}
.lp-v1{animation-timeline:--step1}.lp-v2{animation-timeline:--step2}.lp-v3{animation-timeline:--step3;animation-name:lp-vis-last}
}}
@media (min-width:64rem){@supports not (animation-timeline:view()){.lp-how-side{display:none}}}
@keyframes lp-vis{0%{opacity:0;transform:translateY(12px)}30%,70%{opacity:1;transform:none}100%{opacity:0;transform:translateY(-12px)}}
@keyframes lp-vis-last{0%{opacity:0;transform:translateY(12px)}30%,100%{opacity:1;transform:none}}

/* features, guests, privacy */
.lp-features{padding-bottom:var(--sg)}
.lp-features .lp-rows{margin-top:48px}@media (min-width:64rem){.lp-features .lp-rows{margin-top:64px}}
.lp-features li{display:grid;column-gap:var(--gap);row-gap:8px;align-items:baseline;padding:24px 0}
@media (min-width:64rem){.lp-features li{grid-template-columns:repeat(12,minmax(0,1fr));padding:32px 0}.lp-features li h3{grid-column:span 5}.lp-features li p{grid-column:7/span 6}}
.lp-features li p{max-width:60ch;color:var(--c-ink2)}
.lp-guest{padding:var(--sg) 0 var(--sg-l)}
.lp-guest .lp-cols{align-items:end;row-gap:24px}
.lp-guest .lp-lead{max-width:48ch}
.lp-guest ol{display:grid;margin-top:48px;border-top:1px solid var(--c-rule);border-bottom:1px solid var(--c-rule)}
@media (min-width:64rem){.lp-guest ol{margin-top:64px}}
.lp-guest li{display:grid;align-content:start;gap:12px;border-top:1px solid var(--c-rule);padding:32px 0}.lp-guest li:first-child{border-top:0}
@media (min-width:40rem){.lp-guest ol{grid-template-columns:repeat(3,minmax(0,1fr))}.lp-guest li{border-top:0;border-left:1px solid var(--c-rule);padding:40px 32px}.lp-guest li:first-child{border-left:0;padding-left:0}.lp-guest li:last-child{padding-right:0}}
.lp-privacy{padding-bottom:var(--sg)}
.lp-privacy .lp-cols{row-gap:40px}
@media (min-width:64rem){.lp-privacy-head{position:sticky;top:7rem;align-self:start}}
.lp-privacy li{display:grid;align-items:baseline;column-gap:32px;row-gap:8px;padding:24px 0}
@media (min-width:40rem){.lp-privacy li{grid-template-columns:minmax(0,2fr) minmax(0,3fr)}}
.lp-privacy li h3{font-size:1.728rem}.lp-privacy li p{color:var(--c-ink2)}

/* the demo */
.lp-try{padding:var(--sg-s) 0}
.lp-try .lp-cols{align-items:center;row-gap:48px}
.lp-try-form{margin:0 auto;width:100%;max-width:36rem}
.lp-try-form fieldset{display:none;margin:0;padding:0;border:0;min-width:0;gap:20px}
.lp-try-form legend{padding:0;float:left;width:100%}
.lp-try-form .lp-p1{display:grid}
.lp-try-form:has(.lp-g1:checked) .lp-p1{display:none}
.lp-try-form:has(.lp-g1:checked):not(:has(.lp-g2:checked)) .lp-p2{display:grid;animation:lp-rise 420ms ${EASE} both}
.lp-try-form:has(.lp-g1:checked):has(.lp-g2:checked):not(:has(.lp-f:checked)) .lp-p3{display:grid;animation:lp-rise 420ms ${EASE} both}
.lp-prog{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-top:8px}
.lp-prog .lp-title{font-size:2rem}
.lp-pair{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:12px}
@media (min-width:40rem){.lp-pair{gap:20px}}
.lp-pair .lp-vs{font-family:${D4},ui-sans-serif,sans-serif;font-size:1.44rem;text-transform:uppercase;color:var(--c-muted)}
.lp-pick{display:grid;gap:8px;border:2px solid var(--c-rule);padding:6px;text-align:left;cursor:pointer;transition:border-color 200ms ${EASE},transform 120ms ${EASE}}
.lp-pick:hover{border-color:var(--c-ink)}.lp-pick:active{transform:translateY(1px)}
.lp-pick b{display:block;font-family:Barlow_600,ui-sans-serif,sans-serif;font-weight:400;line-height:1.2;padding:0 4px}
.lp-pick small{display:block;padding:0 4px 4px;font-size:.875rem;color:var(--c-muted);font-variant-numeric:tabular-nums}
.lp-fo{display:none}
.lp-pair-final{grid-template-columns:repeat(2,minmax(0,1fr));position:relative}
.lp-pair-final::after{content:attr(data-vs);position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:2px 6px;background:var(--c-paper2);font-family:${D4},ui-sans-serif,sans-serif;font-size:1.44rem;text-transform:uppercase;color:var(--c-muted)}
.lp-try-form:has(.lp-g1-a:checked) .lp-fo-a,.lp-try-form:has(.lp-g1-b:checked) .lp-fo-b,.lp-try-form:has(.lp-g2-c:checked) .lp-fo-c,.lp-try-form:has(.lp-g2-d:checked) .lp-fo-d{display:grid}
.lp-res{display:none;justify-items:center;gap:24px;text-align:center}
.lp-res-card{width:100%;max-width:260px;animation:lp-rise 420ms ${EASE} both}
.lp-res-actions{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:12px}
.lp-try-form:has(.lp-g1:checked):has(.lp-g2:checked):has(.lp-f:checked) .lp-res{display:grid}
.lp-res .lp-c{display:none}
.lp-try-form:has(.lp-f-a:checked) .lp-c-a,.lp-try-form:has(.lp-f-b:checked) .lp-c-b,.lp-try-form:has(.lp-f-c:checked) .lp-c-c,.lp-try-form:has(.lp-f-d:checked) .lp-c-d{display:block}
@media (min-width:48rem){.lp-res .lp-btn-primary{}}
.lp-reset{font:inherit}

/* FAQ */
.lp-faq{padding-bottom:var(--sg-l)}
.lp-faq .lp-rows{margin-top:40px}@media (min-width:64rem){.lp-faq .lp-rows{margin-top:56px}}
.lp-faq summary{display:flex;align-items:center;justify-content:space-between;gap:24px;min-height:64px;padding:16px 0;cursor:pointer;list-style:none}
.lp-faq summary::-webkit-details-marker{display:none}
.lp-faq summary .lp-title{font-size:1.728rem}@media (min-width:40rem){.lp-faq summary .lp-title{font-size:2rem}}
.lp-faq summary svg{color:var(--c-muted);transition:color 200ms ${EASE},transform 200ms ${EASE}}
.lp-faq summary:hover svg{color:var(--c-accent)}
.lp-faq details[open] summary svg{transform:rotate(45deg)}
.lp-faq summary:focus-visible{outline:2px solid var(--c-focus);outline-offset:-2px}
.lp-faq details p{max-width:65ch;padding-bottom:28px;color:var(--c-ink2)}
.lp-faq details[open] p{animation:lp-unfold 220ms ${EASE} backwards}
@keyframes lp-unfold{from{opacity:0;transform:translateY(-6px)}}

/* final, footer */
.lp-final{padding:var(--sg) 0}
.lp-final .lp-cols{align-items:end;row-gap:32px}
.lp-final .lp-lead{max-width:40ch}
.lp-final-side{display:grid;gap:24px}
.lp-footer{border-top:1px solid var(--c-rule);padding:96px 0 40px}
.lp-mast{display:flex;align-items:center;gap:.14em;font-size:clamp(6rem,16vw,13rem);line-height:1}
.lp-mast span{font-family:${D},ui-sans-serif,sans-serif;font-weight:200;text-transform:uppercase;line-height:1}
.lp-footer .lp-tagline{margin-top:16px;color:var(--c-muted)}
.lp-footer .lp-cols{margin-top:40px;padding-top:24px;row-gap:24px}
.lp-flist{display:flex;flex-wrap:wrap;align-items:center;column-gap:24px;font-size:.875rem}
.lp-flist.lg{column-gap:20px}
.lp-flist a{display:inline-flex;align-items:center;min-height:44px}
.lp-flist a[aria-current]{color:var(--c-ink);text-decoration:underline;text-decoration-color:var(--c-accent);text-underline-offset:8px}
.lp-flist a:not([aria-current]){color:var(--c-muted)}
.lp-flist.links a{text-decoration:underline;text-decoration-color:var(--c-muted);text-underline-offset:.2em;color:var(--c-ink)}
.lp-footer .lp-side{display:grid;gap:12px;align-content:start}
.lp-attr{max-width:28rem;font-size:.875rem;line-height:1.35;color:var(--c-muted)}

/* install: <details>; hidden once running as an installed app */
.lp-install{display:inline-block}
.lp-install[open]{flex:1 1 100%;display:block}
.lp-install>summary{list-style:none;cursor:pointer}
.lp-install>summary::-webkit-details-marker{display:none}
.lp-install-panel{display:grid;gap:20px;max-width:32rem;margin-top:12px;padding:24px;border:1px solid var(--c-rule);background:var(--c-paper);text-align:left}
.lp-install-panel h2{font-family:${D4},ui-sans-serif,sans-serif;font-size:2rem;line-height:1.02;text-transform:uppercase}
.lp-install-panel li{display:grid;gap:4px;padding:16px 0}
.lp-install-panel li span{font-size:.875rem;color:var(--c-ink2)}
.lp-install-q{background:none;border:0;padding:0;font:inherit;color:inherit}
.lp-install-link{display:inline-flex;align-items:center;gap:8px;min-height:44px;font-size:.875rem;text-decoration:underline;text-decoration-color:var(--c-muted);text-underline-offset:.2em;color:var(--c-ink)}
@media (display-mode:standalone),(display-mode:fullscreen),(display-mode:minimal-ui){.lp-install{display:none!important}}

/* sticky CTA: phones only, once the hero has left and until the closing call is in view */
.lp-cta{display:none}
@supports (animation-timeline:view()){@media (max-width:47.99rem){
.lp-cta{display:block;position:sticky;bottom:0;z-index:40;border-top:1px solid var(--c-rule);background:var(--c-paper);padding:12px 16px max(env(safe-area-inset-bottom),12px);opacity:0;pointer-events:none;animation:lp-past linear both,lp-gone linear both;animation-timeline:--hero,--final;animation-range:exit 40% exit 100%,entry 0% entry 30%}
}}
.lp-root{timeline-scope:--hero,--final}
.lp-hero{view-timeline:--hero block}
.lp-final{view-timeline:--final block}
@keyframes lp-past{from{opacity:0;pointer-events:none}to{opacity:1;pointer-events:auto}}
@keyframes lp-gone{from{visibility:visible}to{visibility:hidden}}

/* scroll-driven: progress line and reveal */
@supports (animation-timeline:scroll()){@media (prefers-reduced-motion:no-preference){
.lp-progress{animation:lp-prog linear both;animation-timeline:scroll(root block)}
}}
@keyframes lp-prog{to{transform:scaleX(1)}}
@supports (animation-timeline:view()){@media (prefers-reduced-motion:no-preference){
.lp [data-reveal]{animation:lp-reveal linear both;animation-timeline:view();animation-range:entry 0% entry 40%}
}}
@keyframes lp-reveal{from{opacity:0;transform:translateY(16px)}}
@media (prefers-reduced-motion:reduce){
.lp-rise,.lp-try-form fieldset,.lp-res-card,.lp-faq details p{animation:none!important}
.lp-cta,.lp-progress{animation-duration:auto!important}
}
`;
