# Policy testing: how comparable tools do it (2026-10-24)

Research for [0001-policies.md](../0001-policies.md). Question: how do authorization and policy-as-code tools let teams write their own checks, and what should a small, readable, closed policy file for pageslens borrow or avoid?

## Tools looked at

| Tool                                                 | What a check looks like                                                                                                                              | Notes for us                                                                                                                                                                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenFGA** (`fga model test`, `.fga.yaml`)          | `check: user, object, assertions: { relation: true/false }`; also `list_objects` / `list_users` with expected lists (`[]` = none)                    | Closest analogue: (subject, relation, object) → expected yes/no. Docs: cover every relation with a passing _and_ a failing case; run in CI (GitHub Action). Failures print expected vs got.                          |
| **SpiceDB** (`zed validate`)                         | `assertTrue` / `assertFalse` lists of `object#permission@subject`; plus **expected relations**: every path by which a subject gets a permission      | Splits _targeted invariants_ (assertions) from the _exhaustive picture_ (expected relations, to spot unintended transitive grants). For us: statements = assertions; docs + future `diff` = the exhaustive picture.  |
| **AWS IAM Access Analyzer** custom checks            | `CheckAccessNotGranted` (these actions are not allowed), `CheckNoNewAccess` (no access beyond a reference policy), `CheckNoPublicAccess`             | Three fixed check kinds, PASS/FAIL, meant for CI before deploy. "Not granted" fails if _any_ listed action is allowed. "No new access" is an allowlist / baseline idea.                                              |
| **Kubernetes** `kubectl auth can-i VERB TYPE --as X` | One line, verb + resource + subject, answer yes/no                                                                                                   | Proof that a _closed_ sentence-like grammar reads naturally. Common guidance: test both what must be possible and what must not.                                                                                     |
| **Checkov** YAML custom policies                     | `metadata` (id, name, category, severity, guideline) + `definition` with a **fixed list of operators**                                               | Every policy has a stable id and a severity; vocabulary is closed, so policies validate. Lesson from their docs: "any item matches" semantics on lists surprise authors, so negative checks need explicit semantics. |
| **conftest / OPA**                                   | Rego `deny`/`warn` rules returning a message; optional `_loc` (file, line); output text, json, github; `conftest verify` unit-tests the policies     | General-purpose and powerful, but a full language: the opposite of what we want. Worth copying: deny vs warn, messages that say what to fix, file/line locations.                                                    |
| **Chef InSpec**                                      | Controls with `id`, `title`, `desc`, `impact` (CVSS-like), `tags`, then `describe … should …`                                                        | Requirements carry metadata (id, title, why, impact) so they can be shared with security/audit and traced to a standard.                                                                                             |
| **Cedar** (`cedar validate`)                         | Policies validated against a schema of entity types and actions                                                                                      | Lesson: a policy can be well-formed and still wrong (`Uzer` vs `User`); names must be checked against what exists.                                                                                                   |
| **Kyverno** (`kyverno test`)                         | Test manifest declares expected result per policy/rule/resource; `--require-tests` fails when no tests are found; output json, yaml, markdown, junit | Fail closed when nothing is tested. JUnit output for CI test reports.                                                                                                                                                |
| **Gherkin / Cucumber**                               | Free-text steps matched by user-written step definitions                                                                                             | What to avoid: ambiguous or unmatched steps are found only at run time, step libraries sprawl, and readability depends on discipline. Open-ended natural language is the anti-pattern.                               |

## What the industry converges on

1. **Assertions are (who, action, resource) → allowed or not.** OpenFGA, SpiceDB, `can-i` and AWS all reduce a check to that triple. Our `<who> can|cannot <privileges> <table>` is the same shape.
2. **Test both sides.** Positive ("Case Manager can read incident") and negative ("anonymous cannot read contact") checks catch different regressions. Recommend it in the docs; don't enforce it.
3. **Allowlists beat denylists for least privilege.** A denylist ("anonymous cannot…") says nothing about a new role someone adds next month. AWS's "no new access" and SpiceDB's expected relations both answer "who _else_ got access?". We need an `only … can …` form.
4. **Closed vocabulary, validated names.** Fixed check kinds and operators (Checkov, AWS), names checked against the model (Cedar). No user-defined steps or patterns (the Gherkin problem).
5. **Each requirement is identifiable.** Stable ids, a title or description, often a severity (Checkov, InSpec). Needed for SARIF rule ids, reports and traceability to a security standard.
6. **Fail closed.** No tests found is a failure (Kyverno `--require-tests`). An empty or missing policy file must not pass.
7. **Failures explain themselves.** Expected vs actual (OpenFGA), a message saying what to fix and a file/line (conftest). Machine formats: JSON now, then SARIF / JUnit / GitHub annotations.
8. **Exhaustive review is a separate tool.** SpiceDB keeps expected relations separate from assertions; AWS keeps "no new access" separate from "not granted". Ours: `docs` (the full matrix) and the planned `diff`, not the policy file.

## Sources

- OpenFGA, Testing models: https://openfga.dev/docs/modeling/testing
- SpiceDB, Validation, testing, debugging: https://authzed.com/docs/spicedb/modeling/validation-testing-debugging
- AWS IAM Access Analyzer custom policy checks: https://docs.aws.amazon.com/IAM/latest/UserGuide/access-analyzer-custom-policy-checks.html
- kubectl auth can-i: https://kubernetes.io/docs/reference/kubectl/generated/kubectl_auth/kubectl_auth_can-i/
- Checkov YAML custom policies: https://www.checkov.io/3.Custom%20Policies/YAML%20Custom%20Policies.html
- conftest: https://www.conftest.dev/
- Chef InSpec controls: https://docs.chef.io/inspec/profiles/controls ; DSL: https://origin.inspec.io/docs/reference/dsl_inspec
- Cedar validation: https://docs.cedarpolicy.com/policies/validation.html
- kyverno test: https://kyverno.io/docs/kyverno-cli/reference/kyverno_test/
