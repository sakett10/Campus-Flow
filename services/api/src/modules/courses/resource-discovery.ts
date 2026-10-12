import type {
  AcademicNode,
  TopicResource,
  TopicResourceVerificationStatus,
} from '@campusflow/types';
import type { DataStore } from '../../data/store.js';

export interface DiscoveredResourceItem {
  id?: string;
  title: string;
  provider: string;
  url: string | null;
  type: TopicResource['type'];
  verificationStatus: TopicResourceVerificationStatus;
  relevanceNote: string;
}

/**
 * Curated repository of verified open educational resources with real, canonical URLs.
 */
const VERIFIED_OPEN_EDUCATIONAL_CATALOG: Array<{
  keywords: string[];
  title: string;
  provider: string;
  url: string;
  type: TopicResource['type'];
  description: string;
}> = [
  {
    keywords: ['algorithm', 'sorting', 'graph', 'tree', 'dynamic programming', 'complexity'],
    title: 'Introduction to Algorithms (MIT OpenCourseWare 6.006)',
    provider: 'MIT OpenCourseWare',
    url: 'https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/',
    type: 'lecture',
    description:
      'Canonical curriculum covering fundamental algorithms, graphs, and dynamic programming.',
  },
  {
    keywords: ['data structure', 'array', 'stack', 'queue', 'hash table', 'linked list'],
    title: 'Data Structures and Program Design',
    provider: 'OpenStax / LibreTexts',
    url: 'https://eng.libretexts.org/Bookshelves/Computer_Science/Programming_Languages/Book%3A_Data_Structures_(Goodrich_et_al.)',
    type: 'textbook',
    description: 'Open textbook on fundamental abstract data types and implementation analysis.',
  },
  {
    keywords: ['calculus', 'derivative', 'integral', 'limit', 'multivariable', 'differentiation'],
    title: 'Calculus Volume 1 & 2',
    provider: 'OpenStax',
    url: 'https://openstax.org/details/books/calculus-volume-1',
    type: 'textbook',
    description:
      'Peer-reviewed open textbook covering limits, derivatives, integration, and applications.',
  },
  {
    keywords: ['linear algebra', 'matrix', 'vector', 'eigenvalue', 'determinant'],
    title: 'Linear Algebra (Gilbert Strang, MIT 18.06)',
    provider: 'MIT OpenCourseWare',
    url: 'https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/',
    type: 'lecture',
    description: 'Classic video lecture series and problem sets by Prof. Gilbert Strang.',
  },
  {
    keywords: ['physics', 'mechanics', 'thermodynamics', 'optics', 'kinematics', 'newton'],
    title: 'University Physics Volume 1',
    provider: 'OpenStax',
    url: 'https://openstax.org/details/books/university-physics-volume-1',
    type: 'textbook',
    description:
      'Calculus-based physics textbook covering mechanics, sound, oscillations, and waves.',
  },
  {
    keywords: ['operating system', 'process', 'thread', 'concurrency', 'memory', 'scheduling'],
    title: 'Operating Systems: Three Easy Pieces (Remzi Arpaci-Dusseau)',
    provider: 'University of Wisconsin-Madison',
    url: 'https://pages.cs.wisc.edu/~remzi/OSTEP/',
    type: 'textbook',
    description: 'Freely accessible textbook on virtualization, concurrency, and persistence.',
  },
  {
    keywords: ['database', 'sql', 'normalization', 'transaction', 'relational', 'acid'],
    title: 'Database Design - 2nd Edition',
    provider: 'BCcampus Open Education',
    url: 'https://opentextbc.ca/dbdesign01/',
    type: 'textbook',
    description: 'Open textbook covering relational modeling, normal forms, and SQL queries.',
  },
  {
    keywords: ['machine learning', 'neural', 'deep learning', 'regression', 'classification'],
    title: 'CS229: Machine Learning Course Materials',
    provider: 'Stanford Online',
    url: 'https://cs229.stanford.edu/syllabus.html',
    type: 'lecture',
    description: 'Course notes, problem sets, and lecture materials from Stanford CS229.',
  },
  {
    keywords: ['computer network', 'tcp', 'ip', 'http', 'dns', 'routing', 'packet'],
    title: 'Computer Networks: A Systems Approach',
    provider: 'SystemsApproach Open Textbooks',
    url: 'https://book.systemsapproach.org/',
    type: 'textbook',
    description:
      'Open source textbook on the Internet architecture, routing protocols, and congestion.',
  },
];

/**
 * Discovers and classifies learning resources for a specific topic.
 */
export async function discoverTopicResources(
  store: DataStore,
  topic: AcademicNode,
  userId: string,
  courseId: string,
): Promise<DiscoveredResourceItem[]> {
  const discovered: DiscoveredResourceItem[] = [];
  const topicTitleLower = topic.title.toLowerCase();

  // 1. Existing explicitly attached topic resources
  const existingAttached = await store.listTopicResources(topic.id, userId);
  for (const r of existingAttached) {
    discovered.push({
      id: r.id,
      title: r.title,
      provider: r.provider || 'Student Added',
      url: r.url ?? null,
      type: r.type,
      verificationStatus: r.verificationStatus,
      relevanceNote: r.relevanceNote || 'Attached to topic',
    });
  }

  // 2. Syllabus-prescribed references linked to this course
  // Check if course has syllabus resources or resource links
  const courseResources = await store.listResources(userId, courseId);
  const syllabusResource = courseResources.find((r) => r.type === 'syllabus');
  if (syllabusResource) {
    // If topic has page references in notes
    if (topic.notes?.includes('Source:')) {
      discovered.push({
        title: `Official Syllabus: ${topic.title} Section`,
        provider: 'Course Syllabus',
        url: null,
        type: 'article',
        verificationStatus: 'syllabus_extracted',
        relevanceNote: `Directly referenced in course syllabus (${topic.notes}).`,
      });
    }
  }

  // 3. User's uploaded library resources matching topic keywords
  for (const res of courseResources) {
    if (res.type !== 'syllabus' && res.title.toLowerCase().includes(topicTitleLower)) {
      discovered.push({
        title: res.title,
        provider: 'Personal Library',
        url: null,
        type: res.type === 'lecture_notes' ? 'lecture' : 'article',
        verificationStatus: 'student_uploaded',
        relevanceNote: 'Matches topic keywords in your uploaded library.',
      });
    }
  }

  // 4. Curated verified open educational resources
  const words = topicTitleLower.split(/[\s,;.-]+/).filter((w) => w.length > 3);

  for (const item of VERIFIED_OPEN_EDUCATIONAL_CATALOG) {
    const isMatched = item.keywords.some(
      (kw) => topicTitleLower.includes(kw) || words.some((w) => kw.includes(w)),
    );

    if (isMatched) {
      // Check if already in discovered list
      const alreadyPresent = discovered.some((d) => d.title === item.title);
      if (!alreadyPresent) {
        discovered.push({
          title: item.title,
          provider: item.provider,
          url: item.url,
          type: item.type,
          verificationStatus: 'verified_external',
          relevanceNote: `${item.description} Verified against open academic curriculum.`,
        });
      }
    }
  }

  // If no external matches found, provide an unverified search recommendation query
  if (discovered.filter((d) => d.verificationStatus === 'verified_external').length === 0) {
    discovered.push({
      title: `Search Open Educational Repositories for "${topic.title}"`,
      provider: 'LibreTexts & OpenStax',
      url: `https://libretexts.org/search/?q=${encodeURIComponent(topic.title)}`,
      type: 'article',
      verificationStatus: 'recommended_unverified',
      relevanceNote: 'Recommended keyword search across peer-reviewed open textbook repositories.',
    });
  }

  return discovered;
}
