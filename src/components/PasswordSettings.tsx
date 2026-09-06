import { useState } from "react";
import { toast } from "sonner";
import { Loader2, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Password card: shows the account's sign-in email and hides the actual
 * password form behind a normal "Change password" prompt dialog, instead of
 * leaving the fields open on the Settings page.
 */
export function PasswordSettings() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setCurrentPassword("");
    setPassword("");
    setConfirm("");
  }

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
      const { error } = await supabase.auth.updateUser(payload as never);
      if (error && /current password/i.test(error.message) && !currentPassword) {
        toast.error("Enter your current password to change it");
        return;
      }
      if (error) throw error;
      toast.success("Password saved — you can now sign in with email and password");
      reset();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel space-y-4 p-6">
      <div>
        <h2 className="text-sm font-semibold">Password</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Sign in with {user?.email ?? "your email"} and a password on any device.
        </p>
      </div>

      <Button
        variant="outline"
        className="w-full sm:w-auto"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <KeyRound className="mr-2 size-4" />
        Change password
      </Button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) reset();
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>
              Leave the current password empty if you have never set one.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password" className="text-xs text-muted-foreground">
                Current password
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
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Save password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
