import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Lets an account created through Google set (or change) an email + password
 * login, so sign-in works in any browser without the OAuth round trip.
 */
export function PasswordSettings() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const payload: { password: string; current_password?: string } = { password };
      if (currentPassword) payload.current_password = currentPassword;
      let { error } = await supabase.auth.updateUser(payload as never);
      // Some accounts require the existing password; surface that clearly.
      if (error && /current password/i.test(error.message) && !currentPassword) {
        toast.error("Enter your current password to change it");
        return;
      }
      if (error) throw error;
      toast.success("Password saved — you can now sign in with email and password");
      setCurrentPassword("");
      setPassword("");
      setConfirm("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel space-y-4 p-6">
      <div>
        <h2 className="text-sm font-semibold">Email &amp; password login</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Set a password for your account so you can sign in with your email on any device.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="current-password" className="text-xs text-muted-foreground">
          Current password (only if you already set one)
        </Label>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="••••••••"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 6 characters"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirm password</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Repeat password"
        />
      </div>
      <Button onClick={save} disabled={busy}>
        {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
        Save password
      </Button>
    </section>
  );
}
