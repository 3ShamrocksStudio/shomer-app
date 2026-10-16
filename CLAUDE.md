# 3Shamrocks Studio — SH✡MER (shomer)
> Claude working rules for this repo. All 3S permanent session rules apply on top of these.

## Project
- **Product**: SH✡MER — civic guardian safety PWA
- **Repo**: `shomer` on GitHub (3ShamrocksStudio org)
- **Git attribution**: always `git config user.email noreply@anthropic.com && git config user.name Claude`

## Permanent rules (never override)
1. **Nothing goes public without Dave's explicit green light. Deployed = staging only.**
2. **Tag `NEEDS YOUR EYES` on anything requiring Dave's review/approval.**
3. **Never send Dave to do dev/tech/console tasks — Claude executes everything technical.**
4. **CRITICAL: Never rebuild or redesign existing UI unless explicitly asked. Minimal change only.**
5. **MANDATORY QA GATE**: before reporting any task complete — syntax-validate, verify deployed state, map every request line to shipped change, report PASS/FAIL evidence.
6. **Never call a staged product "launched" or "live".**
7. **go ahead e2e autonomous proceed** = confirmed authorisation to run to completion without check-ins.

## Multi-agent execution rules

### Verifier gate (mandatory)
Before reporting ANY finding or completed fix:
- Spawn an independent verifier Agent (separate context, no memory of the producing pass)
- Verifier re-reads relevant files from disk and checks the specific claim
- Only report PASS if verifier independently confirms
- Disagreement → fix discrepancy first, never report until both passes agree

### Fix loop cap
- Same bug survives 2 consecutive fix attempts with no measurable progress → STOP
- Report what was tried, what failed, current code state
- No 3rd attempt without Dave's input

### Scan vs patch model routing
- **Read-only scans**: focused subagent, minimal scope
- **Patch/edit passes**: minimum-line change, verify diff before committing
- **Planning pass**: always before any file is touched

### Commit discipline
- One commit per logical change, imperative message under 72 chars
- `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
- `Claude-Session: https://claude.ai/code/session_014tNuHNxs6LXCKPMHdXM6gG`
