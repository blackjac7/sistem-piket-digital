"use client";

import { useId, useState } from "react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";

export function PasswordField({ label, name, autoComplete, placeholder = "Masukkan kata sandi", helperText }: { label: string; name: string; autoComplete: "current-password" | "new-password"; placeholder?: string; helperText?: string }) {
  const id = useId();
  const helperId = helperText ? `${id}-helper` : undefined;
  const [visible, setVisible] = useState(false);
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <span className="input-icon password-control">
        <LockKeyhole aria-hidden="true" />
        <input id={id} name={name} type={visible ? "text" : "password"} autoComplete={autoComplete} placeholder={placeholder} aria-describedby={helperId} required />
        <button type="button" className="password-toggle" aria-label={visible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} aria-pressed={visible} onClick={() => setVisible((value) => !value)}>
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </span>
      {helperText && <small className="helper-text" id={helperId}>{helperText}</small>}
    </label>
  );
}
