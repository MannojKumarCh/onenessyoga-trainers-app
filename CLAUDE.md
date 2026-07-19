# Oneness Yoga Trainers App

## Review agent conventions

Any review/audit sub-agent created for this project (e.g. `ux-reviewer`, `code-health-reviewer`) must write its findings to a report file, not just return text:

- Report path: `Agent Reviews/<Agent-Name>/<agent-name>_<YYYY-MM-DD_HH-MM-SS>.md`
- One folder per agent under `Agent Reviews/` at the project root.
- The report's top heading should state the agent name and the full date/time it ran.
