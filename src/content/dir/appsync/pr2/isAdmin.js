export function isAdmin(ctx) {
    const groups = ctx.identity.groups || [];
  
    return groups.includes('admins');
  }