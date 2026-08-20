// Maps a topic string (exactly as it appears in TopicSelect.jsx / sequence.topic)
// to its optimized image slug under /public/session-images/<slug>.jpg.
// Not every topic has an image - getSessionImageUrl() returns null for the rest.
const TOPIC_TO_SLUG = {
  'Festival Holiday': 'festival-holiday',
  'National Holiday': 'national-holiday',

  'Meditation': 'meditation',
  'Trataka Kriya': 'trataka-kriya',
  'Yoga Nidra': 'yoga-nidra',

  'Pranayama - Bandhas': 'pranayama-bandhas',
  'Pranayama - Cooling Techniques': 'pranayama-cooling-techniques',
  'Pranayama - Jasmine Breathing': 'pranayama-jasmine-breathing',
  'Pranayama - Multiple': 'pranayama-multiple',
  'Pranayama - Pranava': 'pranayama-pranava',

  'Face Yoga': 'face-yoga',
  'Kids Yoga': 'kids-yoga',
  'Partner Yoga': 'partner-yoga',
  'Pilates': 'pilates',
  'Yoga Dance': 'yoga-dance',
  'Yoga + Face Yoga': 'yoga-face-yoga',
  'Yoga + Mudita': 'yoga-mudita',

  '21 Sets Surya Namaskaras': '21-sets-surya-namaskaras',
  '100 Asanas': '100-asanas',
  '108 Surya Namaskaras': '108-surya-namaskaras',
  'Surya Namaskar + Yoga': 'surya-namaskar-yoga',

  'Yoga - Balancing': 'yoga-balancing',
  'Yoga - Chest Opening': 'yoga-chest-opening',
  'Yoga - Hip Openers': 'yoga-hip-openers',
  'Yoga - Holdings': 'yoga-holdings',
  'Yoga - Repetition': 'yoga-repetition',
  'Yoga - Strengthening': 'yoga-strengthening',
  'Yoga - Stretching': 'yoga-stretching',
  'Yoga - Weight Loss': 'yoga-weight-loss',
  'Yoga - Women Health': 'yoga-women-health',

  'Ashtanga Vinyasa': 'ashtanga-vinyasa',
  'Chandra Namaskar + Yoga': 'chandra-namaskar-yoga',
  'Power Yoga': 'power-yoga',
  'Therapeutic Yoga': 'therapeutic-yoga',
  'Traditional Yoga': 'traditional-yoga',
  'Vinyasa Yoga': 'vinyasa-yoga',
  'Yin Yoga': 'yin-yoga',

  'Yoga with property - Belt/Chunni/Strap': 'yoga-with-property-belt-chunni-strap',
  'Yoga with property - Blocks/Bottle': 'yoga-with-property-blocks-bottle',
  'Yoga with property - Chair': 'yoga-with-property-chair',
  'Yoga with property - Wall': 'yoga-with-property-wall',

  'Animal Walks': 'animal-walks',
  'Intense Yoga': 'intense-yoga',
  'Nutrition': 'nutrition',
  'Village Yoga': 'village-yoga'
};

export function getSessionImageUrl(topic) {
  const slug = TOPIC_TO_SLUG[topic];
  return slug ? `/session-images/${slug}.jpg` : null;
}
