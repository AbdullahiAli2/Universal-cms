from rest_framework import serializers

from apps.accounts.avatars import avatar_url

from .agent import describe_agent, describe_ip
from .models import AuditLog

# Module shown in the audit trail, from the first part of the action name.
MODULES = {
    "entry": "Content",
    "media": "Media",
    "member": "Users",
    "user": "Users",
    "role": "Roles",
    "website": "Settings",
    "branding": "Branding",
    "domain": "Domains",
    "seo": "SEO",
    "auth": "Account",
    "profile": "Account",
    "email": "Email",
}


# What each recorded action means, in plain words.
ACTION_LABELS = {
    "auth.bootstrap": "Set up the installation",
    "auth.login": "Signed in",
    "auth.login_failed": "Failed sign-in attempt",
    "auth.password_changed": "Changed password",
    "auth.session_revoked": "Signed out a device",
    "auth.invitation_accepted": "Accepted an invitation",
    "profile.updated": "Updated their profile",
    "profile.avatar_updated": "Changed profile photo",
    "profile.avatar_removed": "Removed profile photo",
    "entry.created": "Created content",
    "entry.updated": "Edited content",
    "entry.deleted": "Deleted content",
    "entry.submit": "Submitted for review",
    "entry.withdraw": "Moved back to draft",
    "entry.publish": "Published content",
    "entry.schedule": "Scheduled content",
    "entry.unpublish": "Unpublished content",
    "entry.archive": "Archived content",
    "entry.restore": "Restored from the archive",
    "entry.revision_restored": "Restored an earlier version",
    "media.uploaded": "Uploaded a file",
    "media.updated": "Edited file details",
    "media.deleted": "Deleted a file",
    "member.added": "Added a team member",
    "member.removed": "Removed a team member",
    "member.role_changed": "Changed a team member's role",
    "user.invited": "Invited a user",
    "user.updated": "Updated a user account",
    "role.permissions_changed": "Changed role permissions",
    "website.created": "Created the website",
    "website.connected": "Connected an existing website",
    "website.updated": "Changed website settings",
    "website.deleted": "Deleted a website",
    "branding.updated": "Updated branding",
    "domain.added": "Added a domain",
    "domain.removed": "Removed a domain",
    "domain.verified": "Verified a domain",
    "domain.primary": "Changed the primary domain",
    "seo.updated": "Changed SEO settings",
    "email.settings_updated": "Changed email settings",
    "email.test_sent": "Sent a test email",
    "email.test_failed": "Test email failed",
}

TARGET_LABELS = {
    "entry": "Content",
    "mediaasset": "Media file",
    "membership": "Team member",
    "user": "User",
    "website": "Website",
    "branding": "Branding",
    "domain": "Domain",
    "seosettings": "SEO settings",
}


def action_label(action):
    return ACTION_LABELS.get(action) or action.split(".", 1)[-1].replace("_", " ").capitalize()


class AuditLogSerializer(serializers.ModelSerializer):
    actor_email = serializers.EmailField(source="actor.email", read_only=True, allow_null=True)
    actor = serializers.SerializerMethodField()
    module = serializers.SerializerMethodField()
    website_name = serializers.CharField(source="website.name", read_only=True, allow_null=True)
    action_label = serializers.SerializerMethodField()
    target_label = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            "id", "created_at", "action", "module", "actor_email", "actor", "target_type", "target_id", "summary",
            "method", "path", "ip_address", "user_agent", "website_name", "action_label", "target_label",
        ]
        read_only_fields = fields

    def get_actor(self, obj):
        user = obj.actor
        if user is None:
            return None
        return {
            "id": user.id, "email": user.email, "name": user.full_name or user.email, "username": user.username,
            "avatar_url": avatar_url(user),
        }

    def get_action_label(self, obj):
        return action_label(obj.action)

    def get_target_label(self, obj):
        return TARGET_LABELS.get(obj.target_type, obj.target_type.capitalize())

    def to_representation(self, obj):
        data = super().to_representation(obj)
        # Browser, system and device parsed on the server; the address normalised (e.g. "::ffff:1.2.3.4").
        data.update(describe_agent(obj.user_agent))
        data.update(describe_ip(obj.ip_address))
        return data

    def get_module(self, obj):
        return MODULES.get(obj.action.split(".", 1)[0], "System")
