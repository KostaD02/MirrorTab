module.exports = async ({ github, context }) => {
  const runUrl = `https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
  const artifactName = `mirrortab-pr-${context.issue.number}`;
  const identifier = '<!-- mirrortab-pr-artifact -->';
  const body = `${identifier}\n✅ **Build Successful!**\n\nThe compiled extension has been uploaded as a workflow artifact. You can download and test it directly:\n\n📦 **[Download ${artifactName}.zip](${runUrl})**`;

  const { data: comments } = await github.rest.issues.listComments({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.issue.number,
  });

  const botComment = comments.find(
    (c) => c.user.type === 'Bot' && c.body.includes(identifier),
  );

  if (botComment) {
    await github.rest.issues.updateComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      comment_id: botComment.id,
      body: body,
    });
  } else {
    await github.rest.issues.createComment({
      issue_number: context.issue.number,
      owner: context.repo.owner,
      repo: context.repo.repo,
      body: body,
    });
  }
};
