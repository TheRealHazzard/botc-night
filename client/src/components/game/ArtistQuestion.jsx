import ClaimBuilder from './ClaimBuilder.jsx';

export default function ArtistQuestion({ artistQuestion, token, llmEnabled }) {
  return (
    <ClaimBuilder
      title="Ask the Storyteller"
      description="Once per game. Privately ask a yes/no question — pick below what you're actually asking. You'll be told the true answer immediately."
      freeformKindLabel="Ask it in my own words"
      freeformHelperText="Type your question exactly as you'd ask it. The Storyteller answers from the true state of the game — nothing about tone or anything unsaid."
      freeformPlaceholder='e.g. "Is the Empath still alive?"'
      submitLabel="Ask this question"
      submittingLabel="Asking the Storyteller…"
      endpoint="/api/artist-question"
      token={token}
      targets={artistQuestion.targets}
      characterOptions={artistQuestion.characterOptions}
      llmEnabled={llmEnabled}
    />
  );
}
