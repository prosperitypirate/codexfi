## Summary

<!-- 1–3 bullet points describing what this PR does and why -->

-

## Related issue

<!-- Link the issue this PR resolves. Use "Closes #N" to auto-close on merge -->

Closes #

## Changes

<!-- Brief description of what changed and the approach taken -->

## Testing

<!-- How was this tested? Benchmark run name, manual test, unit test, etc. -->

## Squash commit title

<!--
PRs are merged with squash. The squash commit title becomes the single commit
release-please reads to decide whether to cut a new release. Get it right:

  fix(plugin): <summary>      → patch release (0.x.y → 0.x.y+1)
  feat(plugin): <summary>     → minor release (0.x → 0.x+1)
  chore: / docs: / ci:        → NO release (release-please ignores these)

If this PR contains a fix or feature in plugin/ but the title uses chore:/docs:/ci:,
no release will be triggered. Use the correct prefix.
-->

Squash title will be: `<type>(<scope>): <summary>`

## Checklist

- [ ] Label(s) added
- [ ] Issue linked above
- [ ] Squash commit title uses correct conventional commit prefix (see above)
- [ ] Benchmark run completed (if touching retrieval, memory store, or prompts)
- [ ] No secrets or hardcoded paths introduced
