
/**
 * Test Batch 01 - Visual DNA Dry Run
 * 
 * 1. Al-Mustasim Billah (Figure)
 * 2. Hulagu Khan (Figure)
 * 3. Fall of Baghdad (Event)
 * 4. Edirne (City)
 * 5. Siege of Baghdad (Battle)
 * 6. Bayt al-Hikma (Landmark)
 * 7. Hijaz (State)
 * 8. Abbasid Astrolabe (Artifact)
 * 9. Prospering of Cordoba (Event) - Replacement: Historically important, non-Prophetic
 * 10. Seljuk Banner (Artifact) - Replacement: Non-text dependent artifact
 */

export const BATCH_01_PROMPTS = [
  {
    entity: "Al-Mustasim Billah",
    type: "Figure",
    era: "Abbasid (1242–1258)",
    anchor: "The Last Abbasid Caliph in Baghdad",
    composition: "rear-three-quarter",
    idea: "The weight of a falling empire; a caliph in his private study as shadows lengthen.",
    sensitivity: "High (Historical Dignity)",
    prompt: "Ultra-realistic historical cinematic scene, premium film-quality photography, museum-quality historical reconstruction. Subject: Al-Mustasim Billah, the last Abbasid Caliph. A rear-three-quarter view of a man in late middle age, dressed in heavy, intricate Abbasid royal robes of deep black and gold silk, a refined turban of fine linen. He is standing by a tall arched window in the Round City of Baghdad. Environment: A private palace chamber filled with stacks of ancient scrolls and astronomical instruments. Soft, dusty late-afternoon light (Dusk) streaming through Mashrabiya latticework, casting complex shadows. Composition: Rear-three-quarter, focusing on the posture of a man burdened by impending history. Foreground: A heavy carved wooden table with an unrolled parchment. Midground: The Caliph looking out toward the horizon. Background: The golden dome of the Palace of the Golden Gate visible in the distance under a hazy, warm sky. Lighting: Low-key, moody, motivated by the window. Materials: Silk, aged wood, stone, parchment. Irth Heritage Cinematic Style: Deep navy-inflected shadows, warm restrained gold highlights. Negative constraints: No visible face, no modern objects, no text, no blood."
  },
  {
    entity: "Hulagu Khan",
    type: "Figure",
    era: "Mongol Empire / Ilkhanate (1258)",
    anchor: "The Conqueror of Baghdad",
    composition: "environmental-distance",
    idea: "The cold observation of a conqueror overlooking his prize from a distance.",
    sensitivity: "Normal",
    prompt: "Ultra-realistic historical cinematic scene, premium film-quality photography, museum-quality historical reconstruction. Subject: Hulagu Khan, grandson of Genghis Khan. A wide-environmental view from behind, showing a figure in Mongol 'deel' armor of leather and iron scales, a distinctive fur-trimmed helmet. He sits atop a sturdy Mongolian horse on a high ridge. Environment: The arid, dusty plains overlooking the Tigris river. Composition: Atmospheric distance, rear view. Foreground: The textures of the horse's coat and the iron plates of the armor. Midground: The figure of the Khan, motionless and imposing. Background: The distant, sprawling skyline of 13th-century Baghdad under a shroud of smoke and dust. Lighting: Overcast, cold, harsh daylight. Materials: Iron, leather, fur, horsehair. Irth Heritage Cinematic Style: Natural earth tones, stone, bronze, deep navy shadows. Negative constraints: No facial identity, no modern weaponry, no gore, no text."
  },
  {
    entity: "Fall of Baghdad",
    type: "Event",
    era: "Abbasid / Mongol (1258)",
    anchor: "The End of the Islamic Golden Age",
    composition: "medium-environmental",
    idea: "The emotional silence of a fallen capital; smoke rising over the Tigris as shadows of an era fade.",
    sensitivity: "High (Historical Tragedy)",
    prompt: "Ultra-realistic historical cinematic scene, premium film-quality photography, museum-quality historical reconstruction. Subject: The Fall of Baghdad, 1258. Focus on the urban atmosphere of a civilization's capital in collapse. Environment: A view from a high rooftop overlooking a residential quarter near the Tigris. Thin plumes of smoke rise from distant buildings into a hazy, orange-tinted sky. Composition: Medium-environmental, balanced and somber. Foreground: A discarded silk shawl and a ceramic bowl on a tiled terrace, abandoned. Midground: Interlocking flat-roofed brick houses, narrow alleys in deep shadow. Background: The silhouette of a Great Mosque's minaret against the smoke-veiled sunset. Lighting: Low-sun, volumetric haze, deep amber and navy palette. Materials: Mud-brick, glazed tiles, silk, smoke. Irth Heritage Cinematic Style: Somber, atmospheric, restrained. Negative constraints: No battlefield combat, no gore, no corpses, no text, no modern architecture."
  },
  {
    entity: "Edirne",
    type: "City",
    era: "Ottoman Empire (14th-15th Century)",
    anchor: "The Second Ottoman Capital",
    composition: "wide-establishing",
    idea: "The transition from Byzantine fortress to Ottoman capital; a misty dawn over the Tunca river.",
    sensitivity: "Normal",
    prompt: "Ultra-realistic historical cinematic scene, premium film-quality photography, museum-quality historical reconstruction. Subject: Edirne (Adrianople) in the early Ottoman period. A wide establishing view of the city rising above the riverbanks. Environment: The Tunca river in the foreground with a stone arched bridge. Composition: Wide-establishing, low horizon. Foreground: Reeds and the reflective surface of the river in the morning mist. Midground: The city walls and early Ottoman stone structures, including the Old Mosque (Eski Cami) under construction. Background: Rolling Thracian hills under a pale dawn sky. Lighting: Soft dawn, cool blue mist with warm golden light hitting the stone tops. Materials: Limestone, timber, river water, mist. Irth Heritage Cinematic Style: Natural stone tones, muted greens, warm restrained gold highlights. Negative constraints: No modern power lines, no cars, no text, no modern tourism infrastructure."
  },
  {
    entity: "Siege of Baghdad",
    type: "Battle",
    era: "Abbasid / Mongol (1258)",
    anchor: "The Mongol Investment of the Round City",
    composition: "action-tracking",
    idea: "The kinetic pressure of a siege; Mongol engineers preparing a trebuchet under a dust-filled sky.",
    sensitivity: "Normal (No Gore)",
    prompt: "Ultra-realistic historical cinematic scene, premium film-quality photography, museum-quality historical reconstruction. Subject: The Siege of Baghdad by Mongol forces. Focus on military engineering and scale. Environment: The outer siege lines facing the massive brick walls of Baghdad. Composition: Action-tracking, low-angle perspective near a Mongol traction trebuchet. Foreground: Heavy wooden beams of a siege engine, thick hemp ropes, and stone projectiles. Midground: Mongol infantry and engineers in leather armor moving with purpose; dust kicked up by horses. Background: The formidable, high defensive walls of Baghdad stretching across the frame, banners fluttering in the wind. Lighting: Overcast, dusty, harsh midday light. Materials: Aged wood, hemp, iron, mud-brick, dust. Irth Heritage Cinematic Style: Earth tones, bronze, deep navy-inflected shadows. Negative constraints: No blood, no gore, no wounds, no corpses, no text."
  },
  {
    entity: "Bayt al-Hikma",
    type: "Landmark",
    era: "Abbasid (9th Century)",
    anchor: "The House of Wisdom",
    composition: "framed-through-architecture",
    idea: "The sanctuary of knowledge; a view into the great library through a grand archway.",
    sensitivity: "Normal",
    prompt: "Ultra-realistic historical cinematic scene, premium film-quality photography, museum-quality historical reconstruction. Subject: Bayt al-Hikma (House of Wisdom) in Baghdad. A view of the interior library hall. Environment: A vast hall with soaring arches and walls lined with infinite wooden pigeonholes filled with parchment scrolls and leather-bound codices. Composition: Framed through an ornate central archway. Foreground: The shadow of the arch and a low reading desk with an oil lamp. Midground: Scholars (seen from behind) engaged with manuscripts. Background: Beams of sunlight (volumetric shafts) cutting through high clerestory windows, illuminating dust motes. Lighting: Natural window light, warm oil-lamp glow. Materials: Dark wood, parchment, polished stone, bronze. Irth Heritage Cinematic Style: Parchment beige, aged wood, warm restrained gold. Negative constraints: No visible text on books, no modern furniture, no electric light."
  },
  {
    entity: "Hijaz",
    type: "State",
    era: "Multi-era (Western Arabia)",
    anchor: "The Cradle of Islam",
    composition: "elevated-environmental",
    idea: "The timeless rugged majesty of the Hijaz mountains and the caravan routes.",
    sensitivity: "Normal",
    prompt: "Ultra-realistic historical cinematic scene, premium film-quality photography, museum-quality historical reconstruction. Subject: The Hijaz region landscape. Environment: The rugged, dark basalt mountains and golden sand valleys near the ancient trade routes. Composition: Elevated-environmental, wide vista. Foreground: A rocky outcrop with sparse desert vegetation. Midground: A small caravan of camels moving slowly along a valley floor, seen from a distance. Background: Layered mountain ranges receding into a heat-haze horizon under a clear, vast sky. Lighting: High-noon sun, sharp shadows, brilliant clarity. Materials: Basalt, sand, camel hair, dry brush. Irth Heritage Cinematic Style: Natural earth tones, dusty beige, deep navy shadows. Negative constraints: No modern roads, no vehicles, no text."
  },
  {
    entity: "Abbasid Astrolabe",
    type: "Artifact",
    era: "Abbasid (10th Century)",
    anchor: "Precision of Medieval Science",
    composition: "museum-macro-detail",
    idea: "The intricate brass craftsmanship of a scientific masterpiece.",
    sensitivity: "Normal",
    prompt: "Ultra-realistic museum photography, premium film-quality macro. Subject: A 10th-century Abbasid Brass Astrolabe. Composition: Museum-macro-detail, extreme close-up on the 'rete' and 'tympan'. Environment: Resting on a dark, velvet-textured surface in a controlled museum environment. Foreground: The sharp edge of the brass ring with fine geometric engravings. Midground: The complex, interlocking pointers of the rete, showing beautiful aged patina. Background: Softly blurred depth of field, focused entirely on the material craft. Lighting: Soft, directional museum spotlight, highlighting the metallic sheen and etched lines. Materials: Aged brass, bronze, dark velvet. Irth Heritage Cinematic Style: Bronze, deep navy shadows, warm restrained gold. Negative constraints: No legible text or fabricated calligraphy, no modern mounting, no fingerprints."
  },
  {
    entity: "Prospering of Cordoba",
    type: "Event",
    era: "Umayyad Caliphate of Cordoba (10th Century)",
    anchor: "The Jewel of the World",
    composition: "medium-environmental",
    idea: "Urban prosperity; a bustling market square near the Great Mosque.",
    sensitivity: "Normal",
    prompt: "Ultra-realistic historical cinematic scene, premium film-quality photography, museum-quality historical reconstruction. Subject: The Prospering of Cordoba under the Umayyads. Environment: A vibrant, clean paved plaza surrounded by horseshoe arches and white-washed buildings. Composition: Medium-environmental. Foreground: A stone fountain with running water. Midground: Residents in fine Al-Andalus textiles (linen and wool) walking past market stalls selling ceramics and citrus fruits. Background: The iconic striped arches of the Great Mosque of Cordoba visible through an opening. Lighting: Bright, clear Mediterranean sunlight, dappled shadows from orange trees. Materials: White plaster, red and white stone, glazed ceramics, water. Irth Heritage Cinematic Style: Natural earth tones, stone, muted greens. Negative constraints: No modern signage, no cars, no text."
  },
  {
    entity: "Seljuk Banner",
    type: "Artifact",
    era: "Seljuk Empire (11th Century)",
    anchor: "Symbol of the Great Seljuks",
    composition: "museum-macro-detail",
    idea: "The woven texture and symbolic power of a nomadic empire's standard.",
    sensitivity: "Normal",
    prompt: "Ultra-realistic museum photography, premium film-quality macro. Subject: The Seljuk War Banner. Composition: Museum-macro-detail, focusing on the heavy silk weave and the central emblem (double-headed eagle or bow and arrow). Environment: Mounted behind protective glass (unseen), softly lit. Foreground: The coarse texture of the ancient silk fibers and gold-thread embroidery. Midground: The central heraldic symbol, faded but still powerful. Background: Deep shadow, highlighting the artifact's silhouette. Lighting: Low-intensity, warm archival lighting. Materials: Silk, gold thread, wood. Irth Heritage Cinematic Style: Earth tones, parchment, bronze. Negative constraints: No legible text, no modern labels, no fantasy restoration."
  }
];
