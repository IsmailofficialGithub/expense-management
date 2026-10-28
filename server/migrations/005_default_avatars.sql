-- Users without a photo get the same generated default avatar new signups get (routes/auth.ts defaultAvatar).
update profiles set avatar_url = 'https://api.dicebear.com/9.x/adventurer-neutral/png?seed=' || id || '&size=256'
 where avatar_url is null;
