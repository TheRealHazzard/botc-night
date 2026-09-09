import ClaimBuilder from './ClaimBuilder.jsx';

export default function GossipClaim({ gossipClaim, token, llmEnabled }) {
  return (
    <ClaimBuilder
      title="Make a statement"
      description="Once per day. Say whatever you like out loud — pick below what you're actually claiming. Tonight, if it was true, someone dies at random. You will not be told which, or whether it was true."
      freeformKindLabel="Say it in your own words"
      freeformHelperText="Type your claim exactly as you'd say it out loud. The Storyteller judges it against the truth — you still won't be told if you were right."
      freeformPlaceholder='e.g. "Ada is not on the good team."'
      submitLabel="Make this claim"
      submittingLabel="Asking the Storyteller…"
      endpoint="/api/gossip-claim"
      token={token}
      targets={gossipClaim.targets}
      characterOptions={gossipClaim.characterOptions}
      llmEnabled={llmEnabled}
    />
  );
}
