import { route } from "@/lib/api";
import { getTrash } from "@/lib/repo";

export const dynamic = "force-dynamic";

export const GET = route(async () => getTrash());
