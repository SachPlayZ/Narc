"use client";

import { walrusUrl, shortAddr } from "../lib/utils";

type Props = {
  decisionBlobId: string | null;
  outcomeBlobId: string | null;
  findingBlobId: string | null;
};

function BlobLink({ id, label }: { id: string | null; label: string }) {
  if (!id) return <span className="text-zinc-600">[{label} —]</span>;
  return (
    <a
      href={walrusUrl(id)}
      target="_blank"
      rel="noreferrer"
      className="text-blue-400 hover:underline font-mono text-xs"
      title={id}
    >
      [{label} {shortAddr(id)}]
    </a>
  );
}

export function BlobChain({ decisionBlobId, outcomeBlobId, findingBlobId }: Props) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <BlobLink id={decisionBlobId} label="decision" />
        <span className="text-zinc-500">→</span>
        <BlobLink id={outcomeBlobId} label="outcome" />
        <span className="text-zinc-500">→</span>
        <BlobLink id={findingBlobId} label="finding" />
      </div>
      <p className="text-zinc-500 text-xs">
        Reconstructed from Walrus blobs — no backend required.
      </p>
    </div>
  );
}
