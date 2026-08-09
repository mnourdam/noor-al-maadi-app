
import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function checkEntities() {
  const { data, error } = await supabaseAdmin
    .from("encyclopedia_entities")
    .select("title, entity_type, metadata, image_path, enabled")
    .limit(20);

  if (error) console.error(error);
  else console.log(data);
}

checkEntities();
