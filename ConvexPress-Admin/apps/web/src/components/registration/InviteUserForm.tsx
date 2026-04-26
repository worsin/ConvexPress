/**
 * Registration System - Invite User Form
 *
 * WordPress equivalent: The "Add New User" form on `user-new.php`.
 *
 * Allows administrators to create invitations that are sent to prospective
 * users. The user receives an email with a token link and must complete
 * signup to activate their account.
 *
 * Fields: email (required), firstName, lastName, role dropdown,
 * personal message textarea, send notification checkbox.
 *
 * Calls: api.registration.mutations.inviteUser
 */

import { useCallback, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import { MailPlusIcon, LoaderIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { getErrorMessage } from "@/lib/utils";

// ─── Valid Roles ───────────────────────────────────────────────────────────────

const ROLE_OPTIONS = [
  { value: "subscriber", label: "Subscriber" },
  { value: "contributor", label: "Contributor" },
  { value: "author", label: "Author" },
  { value: "editor", label: "Editor" },
  { value: "administrator", label: "Administrator" },
] as const;

// ─── Component ─────────────────────────────────────────────────────────────────

export function InviteUserForm() {
  const inviteUser = useMutation(api.registration.mutations.inviteUser);

  // Form state
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState("subscriber");
  const [message, setMessage] = useState("");
  const [sendNotification, setSendNotification] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = useCallback(() => {
    setEmail("");
    setFirstName("");
    setLastName("");
    setRole("subscriber");
    setMessage("");
    setSendNotification(true);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const trimmedEmail = email.trim().toLowerCase();
      if (!trimmedEmail) {
        toast.error("Email address is required.");
        return;
      }

      setIsSubmitting(true);
      try {
        await inviteUser({
          email: trimmedEmail,
          role,
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
          message: message.trim() || undefined,
          sendNotification,
        });

        toast.success(`Invitation sent to ${trimmedEmail}`);
        resetForm();
      } catch (err: unknown) {
        const errorMessage = getErrorMessage(err, "Failed to send invitation.");
        toast.error(errorMessage);
      } finally {
        setIsSubmitting(false);
      }
    },
    [email, role, firstName, lastName, message, sendNotification, inviteUser, resetForm],
  );

  return (
    <div className="border border-border bg-card">
      {/* Section Header */}
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">
          Invite New User
        </h2>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        {/* Help Text */}
        <p className="text-xs text-muted-foreground">
          An invitation email will be sent. The user must complete signup to
          activate their account.
        </p>

        {/* Email */}
        <div className="space-y-1">
          <Label htmlFor="invite-email">
            Email <span className="text-destructive">*</span>
          </Label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            required
            disabled={isSubmitting}
          />
        </div>

        {/* Name Fields - Side by Side */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="invite-first-name">First Name</Label>
            <Input
              id="invite-first-name"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
              disabled={isSubmitting}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="invite-last-name">Last Name</Label>
            <Input
              id="invite-last-name"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
              disabled={isSubmitting}
            />
          </div>
        </div>

        {/* Role */}
        <div className="space-y-1">
          <Label htmlFor="invite-role">Role</Label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={isSubmitting}
            className="dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-none border bg-transparent px-2.5 py-1 text-xs transition-colors focus-visible:ring-1 outline-hidden disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Personal Message */}
        <div className="space-y-1">
          <Label htmlFor="invite-message">Personal Message (optional)</Label>
          <textarea
            id="invite-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Add a personal note to the invitation email..."
            disabled={isSubmitting}
            rows={3}
            className="dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 h-auto w-full rounded-none border bg-transparent px-2.5 py-1.5 text-xs transition-colors focus-visible:ring-1 outline-hidden resize-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        {/* Send Notification Checkbox */}
        <div className="flex items-center gap-2">
          <Checkbox
            id="invite-send-notification"
            checked={sendNotification}
            onCheckedChange={(checked) =>
              setSendNotification(checked === true)
            }
            disabled={isSubmitting}
          />
          <Label
            htmlFor="invite-send-notification"
            className="cursor-pointer text-muted-foreground"
          >
            Send the new user an email about their invitation
          </Label>
        </div>

        {/* Submit Button */}
        <div className="flex justify-start pt-2">
          <Button type="submit" disabled={isSubmitting || !email.trim()}>
            {isSubmitting ? (
              <>
                <LoaderIcon className="mr-1.5 size-3 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <MailPlusIcon className="mr-1.5 size-3" />
                Add New User
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
