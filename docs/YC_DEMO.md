# YC Demo Path

This repo's public baseline is deployable and demoable. A YC-quality demo should prove the runtime chain, not just the UI shell.

## Seed expectations

The seeded workspace should show:

- one normal session
- one blocked exfiltration session
- one escalated incident
- one policy simulation example
- one integration verification example

## Live demo flow

1. Sign in as the demo operator.
2. Open Overview and show live posture.
3. Open Quickstart and explain the integration modes.
4. Trigger a simulated risky request through `/api/playground/simulate`.
5. Open TraceVault and inspect the resulting evidence chain.
6. Walk the chain:
   - prompt
   - tool metadata
   - risk factors
   - policy match
   - runtime action
   - incident escalation
7. If using the private premium adapter, continue into policy/risk/incidents/integrations flows without changing route structure.

## What the story proves

- RiskDelta captures runtime behavior, not just prompts
- scoring is explainable
- policy is deterministic
- intervention is operator-readable
- incidents inherit evidence instead of rebuilding context later
