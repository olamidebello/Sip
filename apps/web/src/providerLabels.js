export const providerBadge=name=>String(name||'').replace(/[^\p{L}\p{N}]/gu,'').slice(0,3).toUpperCase();
