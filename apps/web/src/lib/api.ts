import type {
  Course,
  Resource,
  ResourceChunk,
  AcademicNode,
  SearchQueryResponse,
} from '@campusflow/types';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001/api/v1';

// Default mock headers for local development
function getHeaders(): HeadersInit {
  return {
    'content-type': 'application/json',
    'x-test-user-id': '11111111-1111-4111-a111-111111111111',
  };
}

export async function fetchCourses(): Promise<Course[]> {
  try {
    const res = await fetch(`${API_BASE}/courses`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('Failed to fetch courses');
    return await res.json();
  } catch {
    // Deterministic fallback for initial build / disconnected preview
    return [
      {
        id: '11111111-1111-4111-a111-111111111111',
        userId: '11111111-1111-4111-a111-111111111111',
        code: 'PHY2001',
        title: 'Electromagnetic Field Theory',
        term: 'Fall 2026',
        syllabusStatus: 'ready',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '22222222-2222-4222-a222-222222222222',
        userId: '11111111-1111-4111-a111-111111111111',
        code: 'CSE3001',
        title: 'Database Systems & Architecture',
        term: 'Fall 2026',
        syllabusStatus: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
  }
}

export async function fetchCourse(id: string): Promise<Course | null> {
  try {
    const res = await fetch(`${API_BASE}/courses/${id}`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    const all = await fetchCourses();
    return all.find((c) => c.id === id) || all[0] || null;
  }
}

export async function createCourse(data: {
  code: string;
  title: string;
  term?: string;
}): Promise<Course> {
  const res = await fetch(`${API_BASE}/courses`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to create course' }));
    throw new Error(err.detail || 'Failed to create course');
  }
  return await res.json();
}

export async function fetchResources(courseId?: string): Promise<Resource[]> {
  try {
    const url = courseId ? `${API_BASE}/resources?courseId=${courseId}` : `${API_BASE}/resources`;
    const res = await fetch(url, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('Failed to fetch resources');
    return await res.json();
  } catch {
    return [
      {
        id: '33333333-3333-4333-a333-333333333333',
        userId: '11111111-1111-4111-a111-111111111111',
        courseId: courseId || '11111111-1111-4111-a111-111111111111',
        title: 'PHY2001_Syllabus_2026.pdf',
        type: 'syllabus',
        objectKey: 'users/11111111-1111-4111-a111-111111111111/resources/syllabus.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1048576,
        contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        pageCount: 6,
        processingStatus: 'ready',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
  }
}

export async function fetchResource(id: string): Promise<Resource | null> {
  try {
    const res = await fetch(`${API_BASE}/resources/${id}`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    const all = await fetchResources();
    return all.find((r) => r.id === id) || all[0] || null;
  }
}

export async function fetchResourceChunks(resourceId: string): Promise<ResourceChunk[]> {
  try {
    const res = await fetch(`${API_BASE}/resources/${resourceId}/chunks`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [
      {
        id: 'c1',
        resourceId,
        userId: '11111111-1111-4111-a111-111111111111',
        courseId: '11111111-1111-4111-a111-111111111111',
        sequence: 0,
        content:
          'Module 1: Electrostatics in Vacuum. Coulombs Law, electric field intensity, Gauss Law and its applications. Potential and electric energy of continuous charge distributions.',
        pageStart: 1,
        pageEnd: 1,
        charCount: 198,
        tokenCount: 50,
        extractionVersion: 'v1.0',
        chunkingVersion: 'v1.0',
        createdAt: new Date(),
      },
      {
        id: 'c2',
        resourceId,
        userId: '11111111-1111-4111-a111-111111111111',
        courseId: '11111111-1111-4111-a111-111111111111',
        sequence: 1,
        content:
          'Module 2: Magnetostatics. Biot-Savart Law, Amperes Circuital Law and its differential formulation. Magnetic vector potential and magnetic boundary conditions.',
        pageStart: 2,
        pageEnd: 2,
        charCount: 165,
        tokenCount: 42,
        extractionVersion: 'v1.0',
        chunkingVersion: 'v1.0',
        createdAt: new Date(),
      },
    ];
  }
}

export async function deleteResource(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/resources/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) {
    throw new Error('Failed to delete resource');
  }
}

export async function retryResource(id: string): Promise<Resource> {
  const res = await fetch(`${API_BASE}/resources/${id}/retry`, {
    method: 'POST',
    headers: getHeaders(),
  });
  if (!res.ok) {
    throw new Error('Failed to retry resource processing');
  }
  return await res.json();
}

export async function fetchAcademicMap(courseId: string): Promise<AcademicNode[]> {
  try {
    const res = await fetch(`${API_BASE}/courses/${courseId}/map`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [
      {
        id: 'n1',
        courseId,
        userId: '11111111-1111-4111-a111-111111111111',
        parentId: null,
        type: 'module',
        title: 'Module 1: Electrostatics in Vacuum',
        description: 'Coulomb law, Gauss law, electric potential',
        orderIndex: 0,
        origin: 'model',
        confidence: 0.85,
        needsReview: 'no',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'n2',
        courseId,
        userId: '11111111-1111-4111-a111-111111111111',
        parentId: 'n1',
        type: 'topic',
        title: 'Gauss Law and Applications',
        description: null,
        orderIndex: 0,
        origin: 'model',
        confidence: 0.8,
        needsReview: 'no',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'n3',
        courseId,
        userId: '11111111-1111-4111-a111-111111111111',
        parentId: null,
        type: 'module',
        title: 'Module 2: Magnetostatics',
        description: 'Biot-Savart, Ampere circuital law',
        orderIndex: 1,
        origin: 'model',
        confidence: 0.85,
        needsReview: 'no',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
  }
}

export async function updateAcademicNode(
  courseId: string,
  nodeId: string,
  updates: { title?: string; description?: string | null; needsReview?: 'yes' | 'no' },
): Promise<AcademicNode> {
  const res = await fetch(`${API_BASE}/courses/${courseId}/map/nodes/${nodeId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to update academic node');
  return await res.json();
}

export async function searchContent(
  query: string,
  courseId?: string,
): Promise<SearchQueryResponse> {
  const url = courseId
    ? `${API_BASE}/search?q=${encodeURIComponent(query)}&courseId=${courseId}`
    : `${API_BASE}/search?q=${encodeURIComponent(query)}`;

  const res = await fetch(url, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    return { query, totalResults: 0, results: [] };
  }
  return await res.json();
}
