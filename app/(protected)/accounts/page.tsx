import Link from "next/link";
import { KeyRound, ShieldCheck, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ResetPasswordControl } from "@/components/reset-password-control";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { roleLabels } from "@/lib/site-config";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null) {
  return value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(value) : "Belum pernah";
}

export default async function AccountsPage() {
  const admin = await requireAdmin();
  const accounts = await db.select({ id: users.id, name: users.name, username: users.username, role: users.role, isActive: users.isActive, mustChangePassword: users.mustChangePassword, passwordChangedAt: users.passwordChangedAt, lastLoginAt: users.lastLoginAt, lockedUntil: users.lockedUntil }).from(users).orderBy(users.role, users.name);
  return (
    <>
      <PageHeader title="Manajemen akun" description="Kelola akses seluruh akun tanpa melihat atau menyimpan kata sandi pengguna." />
      <div className="account-summary">
        <article><UsersRound /><span><strong>{accounts.length}</strong><small>Total akun</small></span></article>
        <article><KeyRound /><span><strong>{accounts.filter((item) => item.mustChangePassword).length}</strong><small>Wajib ganti password</small></span></article>
        <article><ShieldCheck /><span><strong>Argon2id</strong><small>Hash kata sandi baru</small></span></article>
      </div>
      <section className="panel accounts-panel">
        <div className="panel-header"><div><h2>Daftar akun</h2><p>Reset menghasilkan password sementara dan otomatis mencabut semua sesi akun.</p></div></div>
        <div className="mobile-data-view"><div className="mobile-record-list">{accounts.map((account) => <article className="mobile-record" key={account.id}>
          <div className="mobile-record-heading"><span className="avatar">{account.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span><span><strong>{account.name}</strong><small>@{account.username}{!account.isActive ? " · Nonaktif" : ""}</small></span><span className="status-pill info">{roleLabels[account.role]}</span></div>
          <dl className="mobile-record-details"><div><dt>Status password</dt><dd>{account.mustChangePassword ? "Wajib diganti" : "Aktif"}</dd></div><div><dt>Login terakhir</dt><dd>{formatDate(account.lastLoginAt)}</dd></div></dl>
          <p className="mobile-record-note">{account.passwordChangedAt ? `Password diubah ${formatDate(account.passwordChangedAt)}` : "Password pribadi belum dibuat pengguna"}{account.lockedUntil && account.lockedUntil > new Date() ? " · Akun terkunci sementara" : ""}</p>
          <div className="mobile-record-actions">{account.id === admin.id ? <Link className="button button-secondary small" href="/account/password"><KeyRound /> Ubah password sendiri</Link> : <ResetPasswordControl userId={account.id} accountName={account.name} />}</div>
        </article>)}</div></div>
        <div className="table-scroll desktop-data-view">
          <table>
            <thead><tr><th>Akun</th><th>Peran</th><th>Status password</th><th>Login terakhir</th><th>Aksi</th></tr></thead>
            <tbody>{accounts.map((account) => (
              <tr key={account.id}>
                <td><strong>{account.name}</strong><span className="table-subtitle">@{account.username}{!account.isActive ? " · Nonaktif" : ""}</span></td>
                <td><span className="status-pill info">{roleLabels[account.role]}</span></td>
                <td><span className={`status-pill ${account.mustChangePassword ? "warning" : "success"}`}>{account.mustChangePassword ? "PASSWORD SEMENTARA" : "AKTIF"}</span><span className="table-subtitle">{account.passwordChangedAt ? `Diubah ${formatDate(account.passwordChangedAt)}` : "Belum diganti pengguna"}{account.lockedUntil && account.lockedUntil > new Date() ? " · Terkunci sementara" : ""}</span></td>
                <td>{formatDate(account.lastLoginAt)}</td>
                <td>{account.id === admin.id ? <Link className="button button-secondary small" href="/account/password"><KeyRound /> Ubah password sendiri</Link> : <ResetPasswordControl userId={account.id} accountName={account.name} />}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </>
  );
}
