module.exports = async ({ github, context }) => {
  const prCommitCount = process.env.PR_COMMIT_COUNT || 'unknown';
  const runUrl = `https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
  const artifactName = `MirrorTab-PR-${context.issue.number}-${prCommitCount}`;
  const body = `✅ **Build Successful!**\n\nThe compiled extension has been uploaded as a workflow artifact. You can download and test it directly:\n\n📦 **[Download ${artifactName}.zip](${runUrl})**`;

  await github.rest.issues.createComment({
    body,
    repo: context.repo.repo,
    owner: context.repo.owner,
    issue_number: context.issue.number,
  });
};
