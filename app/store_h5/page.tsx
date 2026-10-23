import { StoreH5Home } from "@/components/store-h5-home";
import { PersonnelStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { addDateKeyDays, lunarMonthDayForGregorianDate } from "@/lib/birthday-reminder-scheduler";
import { hasPendingDailyLearningTask } from "@/lib/daily-learning";
import { requireStoreH5PageSession } from "@/lib/store-h5-auth";
import { hasRolePermission } from "@/lib/role-permissions";
import { countPendingStoreTaskInstances, dateKeyAsDbDate, shanghaiDateKey } from "@/lib/store-h5-tasks";

export default async function StoreH5Page() {
  const session = await requireStoreH5PageSession();
  const [initialPendingCount, initialDailyLearningPending, birthdayPersonnel] = await Promise.all([
    hasRolePermission(session.permissions, "store-h5:tasks:query") ? countPendingStoreTaskInstances(session.userId).catch(() => 0) : 0,
    hasRolePermission(session.permissions, "store-h5:daily-learning:query") ? hasPendingDailyLearningTask(session.userId).catch(() => false) : false,
    session.storeId ? db.personnel.findMany({
      where: { storeId: session.storeId, status: PersonnelStatus.ACTIVE, deletedAt: null, birthday: { not: null } },
      select: { id: true, name: true, birthday: true, birthdayCalendar: true },
    }).catch(() => []) : [],
  ]);
  const today = shanghaiDateKey();
  const weekday = dateKeyAsDbDate(today).getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const weekStart = addDateKeyDays(today, mondayOffset);
  const birthdayRows = birthdayPersonnel.flatMap(person => {
    if (!person.birthday) return [];
    const birthdayDate = Array.from({ length: 7 }, (_, index) => addDateKeyDays(weekStart, index)).find(date =>
      person.birthdayCalendar === "SOLAR" ? date.slice(5) === person.birthday : lunarMonthDayForGregorianDate(date) === person.birthday,
    );
    return birthdayDate ? [{ id: person.id, name: person.name, birthday: person.birthday, birthdayCalendar: person.birthdayCalendar, date: birthdayDate }] : [];
  }).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "zh-CN"));
  return <StoreH5Home realName={session.realName} storeName={session.storeName} permissions={session.permissions} initialPendingCount={initialPendingCount} initialDailyLearningPending={initialDailyLearningPending} birthdayRows={birthdayRows} canAccessDailyAttendance={Boolean(session.storeId) && hasRolePermission(session.permissions, "store-h5:daily-attendance:view")} />;
}
