import { PageHeader } from "@/components/page-header";
import { SystemParameters } from "@/components/system-parameters";
import { requirePageAccess } from "@/lib/auth";
import { getBusinessDictionaryOptions } from "@/lib/business-dictionaries";
import { db } from "@/lib/db";
import { getNextMonthLaborCostPolicy } from "@/lib/labor-cost-policy";
import { getPlatformConfig, splitPlatformConfig } from "@/lib/platform-config";

export default async function SystemParametersPage() {
  await requirePageAccess("/lead_pc/settings/parameters");
  const [platform, r2Storages, aiServices, laborCostPolicy] = await Promise.all([
    getPlatformConfig(),
    db.r2StorageConfig.findMany({
      where: { status: "ENABLED", deletedAt: null },
      select: { id: true, name: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    getBusinessDictionaryOptions("AI_SERVICE")
      .then(options => ({ options, error: false }))
      .catch(() => ({ options: [], error: true })),
    getNextMonthLaborCostPolicy(),
  ]);
  const activeIds = new Set(r2Storages.map(storage => storage.id));
  const activeStorageId = (id: string | null) => id && activeIds.has(id) ? id : null;
  const { settings, assetUrls } = splitPlatformConfig(platform);

  return <main className="page-wrap">
    <PageHeader title="系统参数" description="维护平台信息、课程培训、考勤参数、Ai API及其他系统配置" />
    <SystemParameters
      initialPlatform={{
        ...settings,
        dailyLearningR2StorageId: activeStorageId(settings.dailyLearningR2StorageId),
        trainingVideoR2StorageId: activeStorageId(settings.trainingVideoR2StorageId),
        trainingAudioR2StorageId: activeStorageId(settings.trainingAudioR2StorageId),
        trainingDocumentR2StorageId: activeStorageId(settings.trainingDocumentR2StorageId),
      }}
      initialAssetUrls={assetUrls}
      r2StorageOptions={r2Storages.map(storage => ({ value: storage.id, label: storage.name }))}
      aiServiceOptions={aiServices.options}
      aiServiceLoadError={aiServices.error}
      initialLaborCostPolicy={laborCostPolicy}
    />
  </main>;
}
