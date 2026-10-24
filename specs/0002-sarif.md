# 0002: SARIF output for `lint` and `test`

**Status:** shipped in 0.4.0 (PR #14). Reference: the README's "In CI" section.

Goal: lint findings and failed policy statements as GitHub code scanning alerts, on the pull request and in the Security tab. No separate design doc was written; the choices were made against GitHub's [SARIF support for code scanning](https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/sarif-support-for-code-scanning) page.

## Key choices

- One run per command, with its own `automationDetails.id` (`pageslens/lint/`, `pageslens/test/`), so uploading both doesn't make one replace the other.
- Every rule has short and full descriptions and help text, and every result a location with a start line: GitHub requires them.
- The site model has no line numbers, so a result points at the line of the record's GUID in its file. In classic list files such as `webrole.yml` that's the right record, not line 1.
- `primaryLocationLineHash`, the fingerprint GitHub matches alerts on, is left to the `upload-sarif` action, which hashes the reported line; the GUID's line doesn't move when other lines do. Our own fingerprint is `pageslens/v1`, for other consumers.
- Policy evidence that is background, not cause (what a role does have, when a `can` statement fails), is marked `context` and becomes related locations, so it doesn't raise alerts on correct permission files.

## As built

- `--format sarif` on `lint` and `test`: SARIF 2.1.0 with what GitHub code scanning requires. Separate categories `pageslens/lint/` and `pageslens/test/`. Exit codes unchanged.
- Lint: a rule per lint rule (help = `rules/<id>.md`, security severity high/medium/low from error/warning/info). Test: a rule per statement (`policy/<id>` or a slug of the text); a failure is reported on each permission or setting that breaks it, with the policy line as a related location; evidence without a file goes on the policy line, and `context` evidence (what a role does have) becomes related locations.
- Results point at the line of the record's GUID (`recordLines` in `src/sarif.ts`), so classic list files get the right line. `primaryLocationLineHash` is left to `upload-sarif`; our own fingerprint is `pageslens/v1`.
- README: CI example with `github/codeql-action/upload-sarif@v4`.
- Verified against the official SARIF 2.1.0 schema (ajv, outside the repo) and GitHub's required fields. **Not yet uploaded to a real repository's code scanning.**
