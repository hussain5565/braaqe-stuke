
-- 1. جدول الحسابات الشخصية (Profiles)
create table public.profiles (
  id uuid references auth.users not null primary key,
  display_name text,
  photo_url text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- تفعيل الحماية (RLS)
alter table public.profiles enable row level security;
create policy "الملفات الشخصية عامة للقراءة" on public.profiles for select using (true);
create policy "المستخدم يمكنه إنشاء ملفه الشخصي" on public.profiles for insert with check (auth.uid() = id);
create policy "المستخدم يمكنه تحديث ملفه الشخصي" on public.profiles for update using (auth.uid() = id);

-- 2. جدول الأسهم المحفوظة (Saved Stocks)
create table public.saved_stocks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  symbol text not null,
  market text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.saved_stocks enable row level security;
create policy "المستخدم يشاهد أسهمه فقط" on public.saved_stocks for select using (auth.uid() = user_id);
create policy "المستخدم يضيف أسهمه فقط" on public.saved_stocks for insert with check (auth.uid() = user_id);
create policy "المستخدم يحذف أسهمه فقط" on public.saved_stocks for delete using (auth.uid() = user_id);

-- 3. جدول سجل التحليلات (Analysis History)
create table public.analysis_history (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  symbol text not null,
  sentiment text not null,
  patterns text[],
  entry_price numeric,
  exit_target numeric,
  reasoning text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.analysis_history enable row level security;
create policy "المستخدم يشاهد سجل تحليلاته فقط" on public.analysis_history for select using (auth.uid() = user_id);
create policy "المستخدم يحفظ تحليلاته" on public.analysis_history for insert with check (auth.uid() = user_id);

-- وظيفة تلقائية لإنشاء ملف شخصي عند تسجيل المستخدم الجديد
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, photo_url)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
