import { ImageResponse } from "next/og";

export const alt = "RiskDelta AI runtime control plane";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const featurePills = ["Runtime control", "Policy engine", "Risk scoring", "TraceVault"];

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background: "#050505",
          color: "#f5f7f4",
          fontFamily: "Arial, sans-serif",
          padding: "68px 76px",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 520,
            height: 520,
            right: -110,
            top: -160,
            borderRadius: 520,
            background: "radial-gradient(circle, rgba(163,255,18,0.18), rgba(163,255,18,0) 68%)",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: 710,
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <svg width="58" height="54" viewBox="0 0 64 60" fill="none">
              <path d="M32 7L57 53H7L32 7Z" stroke="#A3FF12" strokeWidth="6" strokeLinejoin="round" />
            </svg>
            <div style={{ display: "flex", fontSize: 44, fontWeight: 700, letterSpacing: "-2px" }}>RiskDelta AI</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div style={{ color: "#a3ff12", fontSize: 16, fontWeight: 700, letterSpacing: "4px", textTransform: "uppercase" }}>
              Autonomous runtime control plane
            </div>
            <div style={{ display: "flex", fontSize: 52, lineHeight: 1.04, fontWeight: 700, letterSpacing: "-2.8px" }}>
              Control unsafe AI behavior before it reaches production.
            </div>
            <div style={{ display: "flex", maxWidth: 660, color: "#a0a8a0", fontSize: 23, lineHeight: 1.45 }}>
              Inspect prompts, tool calls, policy hits, risk verdicts, and incidents in one operator control plane.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            {featurePills.map((feature, index) => (
              <div
                key={feature}
                style={{
                  display: "flex",
                  border: "1px solid #252b25",
                  background: index === 0 ? "#a3ff12" : "#0d0f0d",
                  color: index === 0 ? "#050505" : "#d8ddd8",
                  padding: "11px 14px",
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                }}
              >
                {feature}
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "absolute",
            right: 70,
            top: 96,
            width: 340,
            height: 438,
            border: "1px solid #252b25",
            background: "#0b0d0b",
            boxShadow: "0 32px 80px rgba(0,0,0,0.55)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", padding: "17px 20px", borderBottom: "1px solid #252b25", fontSize: 13, color: "#a0a8a0" }}>
            <span>LIVE TRACE</span><span style={{ color: "#ff5d5d" }}>BLOCK</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", padding: "24px 22px", gap: 16, borderBottom: "1px solid #252b25" }}>
            <span style={{ color: "#6f776f", fontSize: 12 }}>PROMPT INTENT</span>
            <span style={{ fontSize: 18, lineHeight: 1.42 }}>Export sensitive payroll data without notifying the operator.</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", padding: "22px", gap: 12, borderBottom: "1px solid #252b25" }}>
            <span style={{ color: "#f5b546", fontSize: 12 }}>POLICY HIT</span>
            <span style={{ color: "#d8ddd8", fontSize: 16 }}>sensitive_output_exfil</span>
          </div>
          <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center", padding: "22px", background: "radial-gradient(circle at 50% 50%, rgba(255,93,93,0.13), transparent 72%)" }}>
            <span style={{ color: "#ff5d5d", fontSize: 12 }}>RUNTIME RISK</span>
            <span style={{ color: "#ff5d5d", fontSize: 48, fontWeight: 700 }}>0.91</span>
            <span style={{ color: "#a0a8a0", fontSize: 14 }}>Execution halted · incident opened</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
