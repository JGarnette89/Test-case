/* =====================================================================
   ONE BROKEN SCREEN MUST NOT TAKE THE APP DOWN.

   Four separate times an uncaught render error blanked the whole page:
   `watched is not defined` in the examiner lab, a null clock under SSR,
   and two more of the same shape. React unmounts the entire tree when a
   render throws and nothing catches it, so the menu, the other screens
   and the home page all vanished with the one that broke. This catches
   it at the screen boundary: the screen that threw shows what it threw
   and a way back, and everything else keeps working.

   A class, because error boundaries still have no hook form. The `key`
   the shell gives each screen resets the boundary when the route
   changes, so leaving a broken screen and coming back retries it.
   ===================================================================== */
import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    /* Loud in the console too: the boundary is for the player, the
       stack is for whoever fixes it. */
    console.error("[screen crashed]", this.props.name ?? "screen", error, info?.componentStack);
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;
    const details = `${this.props.name ?? "screen"}\n${error?.stack ?? String(error)}\n${info?.componentStack ?? ""}`;
    return (
      <div style={S.wrap} role="alert">
        <div style={S.title}>This screen hit an error and stopped.</div>
        <div style={S.sub}>The rest of the app is fine — use the menu, or go home. If you can, copy the details and pass them on.</div>
        <pre style={S.pre}>{String(error?.message ?? error)}</pre>
        <div style={S.row}>
          <button className="btn" style={S.btn} onClick={() => { window.location.hash = "#/"; }}>Home</button>
          <button className="btn" style={S.btn} onClick={() => this.setState({ error: null, info: null })}>Try again</button>
          <button className="btn" style={S.btn} onClick={() => {
            try { navigator.clipboard?.writeText(details); } catch { /* the pre below is selectable */ }
          }}>Copy details</button>
        </div>
        <pre style={{ ...S.pre, fontSize: 11, opacity: 0.7, maxHeight: 220, overflow: "auto" }}>{details}</pre>
      </div>
    );
  }
}

const S = {
  wrap: { padding: 16, maxWidth: 720, margin: "0 auto", fontFamily: "'Inter',system-ui,sans-serif", color: "#E6E8EC" },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 6 },
  sub: { fontSize: 13, color: "#9AA3B2", marginBottom: 12 },
  pre: { whiteSpace: "pre-wrap", wordBreak: "break-word", background: "rgba(255,255,255,0.05)", padding: 10, borderRadius: 8, fontSize: 13, userSelect: "text" },
  row: { display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" },
  btn: { minHeight: 44, padding: "0 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#E6E8EC", fontSize: 14 },
};
