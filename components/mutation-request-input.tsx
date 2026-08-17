"use client";

import { useEffect, useRef } from "react";

export function MutationRequestInput({ resetKey }: { resetKey?: unknown }) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.value = crypto.randomUUID();
  }, [resetKey]);

  return <input ref={inputRef} type="hidden" name="requestId" required />;
}
