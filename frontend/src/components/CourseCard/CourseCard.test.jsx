import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import CourseCard from './CourseCard'
import { renderWithProviders } from '../../test-utils'

const mockCourse = {
  courseId: 4,
  courseCode: 'CMPE 120',
  courseTitle: 'Computer Organization and Architecture',
  description: 'Introduction to computer organization, digital logic, and processor design.',
  units: 3,
  department: 'CMPE',
}

const mockPrereqs = [
  { courseId: 4, prereqCourseId: 2, prereqType: 'prereq' },
]

// a term that isn't on the sample roadmap, so adding skips the prereq check
function makeSection(courseCode, sectionCode = '01') {
  return {
    id: `${courseCode}-${sectionCode}`,
    courseCode,
    sectionCode,
    classNumber: 1000 + Number(sectionCode),
    days: 'MW',
    times: '10:30AM-11:45AM',
    term: 'Spring 2030',
  }
}

function renderCourseCard(ui) {
  return renderWithProviders(ui)
}

describe('CourseCard', () => {
  it('renders course code', () => {
    renderCourseCard(<CourseCard course={mockCourse} prereqs={[]} />)
    expect(screen.getByText('CMPE 120')).toBeDefined()
  })

  it('renders course title', () => {
    renderCourseCard(<CourseCard course={mockCourse} prereqs={[]} />)
    expect(screen.getByText('Computer Organization and Architecture')).toBeDefined()
  })

  it('renders department badge', () => {
    renderCourseCard(<CourseCard course={mockCourse} prereqs={[]} />)
    expect(screen.getByText('CMPE')).toBeDefined()
  })

  it('renders units', () => {
    renderCourseCard(<CourseCard course={mockCourse} prereqs={[]} />)
    expect(screen.getByText('3 units')).toBeDefined()
  })

  it('renders prerequisites', () => {
    renderCourseCard(<CourseCard course={mockCourse} prereqs={mockPrereqs} />)
    expect(screen.getByText(/Prerequisites:/)).toBeDefined()
    expect(screen.getByText(/CMPE 50/)).toBeDefined()
  })

  it('does not render prerequisites section when none exist', () => {
    renderCourseCard(<CourseCard course={mockCourse} prereqs={[]} />)
    expect(screen.queryByText(/Prerequisites:/)).toBeNull()
  })

  describe('adding a section', () => {
    afterEach(() => {
      localStorage.clear()
    })

    function addFirstSection(section) {
      const onSectionAdded = vi.fn()
      renderCourseCard(
        <CourseCard course={mockCourse} prereqs={[]} sections={[section]} onSectionAdded={onSectionAdded} />
      )

      fireEvent.click(screen.getByRole('button', { name: 'View 1 sections' }))
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
      return onSectionAdded
    }

    it('reports the added section', () => {
      const onSectionAdded = addFirstSection(makeSection('CMPE 120'))
      expect(onSectionAdded).toHaveBeenCalledWith(expect.objectContaining({ id: 'CMPE 120-01' }))
    })

    it('does not report a section that conflicts', () => {
      localStorage.setItem('coursePlanner.schedulesByTerm', JSON.stringify({
        'Spring 2030': [makeSection('CMPE 131')],
      }))

      const onSectionAdded = addFirstSection(makeSection('CMPE 120', '02'))
      expect(onSectionAdded).not.toHaveBeenCalled()
    })
  })
})

describe('grade distribution actions', () => {
  const history = [
    { academicYear: '2024-2025', semester: 'Fall', aCount: 10, bCount: 5, cCount: 3, dCount: 1, fCount: 1, total: 20 },
    { academicYear: '2023-2024', semester: 'Spring', aCount: 5, bCount: 5, cCount: 0, dCount: 0, fCount: 0, total: 10 },
  ]
  const sections = [
    { ...makeSection('CMPE 120'), instructor: 'Ada Chen', openSeats: 12, location: 'ENG 232', satisfies: 'GE: UD 3', gradeDistributions: history },
    { ...makeSection('CMPE 120', '02'), instructor: 'Jordan Lee', gradeDistributions: [] },
    { ...makeSection('CMPE 120', '03'), instructor: 'Morgan Patel' },
  ]
  const aggregate = { aCount: 50, bCount: 20, cCount: 15, dCount: 10, fCount: 5, total: 100 }

  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  function renderGrades(courseSections = sections) {
    const fetchMock = vi.fn(url => Promise.resolve({
      ok: true,
      json: async () => url === '/api/catalog/terms' ? [] : aggregate,
    }))
    vi.stubGlobal('fetch', fetchMock)
    renderCourseCard(<CourseCard course={mockCourse} prereqs={[]} sections={courseSections} />)
    return fetchMock
  }

  function expectNoTabs(dialog) {
    expect(dialog.queryByRole('button', { name: 'Overall Course' })).toBeNull()
    expect(dialog.queryByRole('button', { name: 'This Professor' })).toBeNull()
    expect(dialog.queryByRole('tab')).toBeNull()
  }

  it('shows one overall action and explicit unavailable messages without changing section details', () => {
    renderGrades()
    expect(screen.getAllByRole('button', { name: 'View Overall Grade Distribution' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'View 3 sections' }))
    expect(screen.getAllByRole('button', { name: 'View Overall Grade Distribution' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'View Grade Distribution', exact: true })).toHaveLength(1)
    expect(screen.getAllByText('Grade distribution data unavailable for this professor')).toHaveLength(2)
    expect(screen.getByText('GE: UD 3')).toBeDefined()
    expect(screen.getAllByRole('link', { name: /Rate My Professors/ })[0].getAttribute('href')).toContain('q=Ada%20Chen')
    expect(screen.getByText('Ada Chen · 12 open seats')).toBeDefined()
    expect(screen.getByText('MW · 10:30AM-11:45AM · ENG 232')).toBeDefined()
  })

  it('loads aggregate data without sections, professor history, or toggles', async () => {
    const fetchMock = renderGrades([])
    fireEvent.click(screen.getByRole('button', { name: 'View Overall Grade Distribution' }))
    expect(await screen.findByText('Based on 100 grades')).toBeDefined()
    expect(fetchMock).toHaveBeenCalledWith('/api/grade-distributions/course?courseNumber=CMPE%20120')
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByText('CMPE 120 · All Professors')).toBeDefined()
    for (const percentage of ['50.0%', '20.0%', '15.0%', '10.0%', '5.0%']) {
      expect(dialog.getByText(percentage)).toBeDefined()
    }
    expect(dialog.queryByText('Semester History')).toBeNull()
    expectNoTabs(dialog)
    fireEvent.click(dialog.getByRole('button', { name: 'Close grade distribution' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows only professor totals and semester history without fetching overall data', () => {
    const fetchMock = renderGrades()
    fireEvent.click(screen.getByRole('button', { name: 'View 3 sections' }))
    fireEvent.click(screen.getByRole('button', { name: 'View Grade Distribution', exact: true }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByText('CMPE 120 · Ada Chen')).toBeDefined()
    expect(dialog.getByText('Based on 30 grades')).toBeDefined()
    expect(dialog.getByText('50.0%')).toBeDefined()
    expect(dialog.getByText('33.3%')).toBeDefined()
    expect(dialog.getByText('Fall 2024-2025')).toBeDefined()
    expect(dialog.getByText('Spring 2023-2024')).toBeDefined()
    expect(dialog.getByText('20 grades')).toBeDefined()
    expect(dialog.getByText('10 grades')).toBeDefined()
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/grade-distributions/'))).toBe(false)
    expectNoTabs(dialog)
  })

  it('shows empty overall data explicitly', async () => {
    const fetchMock = renderGrades()
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ...aggregate, total: 0 }) })
    fireEvent.click(screen.getByRole('button', { name: 'View Overall Grade Distribution' }))
    expect(await screen.findByText('Grade distribution data unavailable for this course')).toBeDefined()
    expect(screen.queryByText('Based on 0 grades')).toBeNull()
  })

  it('reports an overall endpoint error without falling back to professor data', async () => {
    const fetchMock = renderGrades()
    fetchMock.mockResolvedValueOnce({ ok: false })
    fireEvent.click(screen.getByRole('button', { name: 'View Overall Grade Distribution' }))
    expect(await screen.findByRole('alert')).toBeDefined()
    expect(screen.queryByText(/Based on/)).toBeNull()
  })

  it('ignores a delayed overall response after opening a professor modal', async () => {
    const fetchMock = renderGrades()
    let resolveRequest
    fetchMock.mockReturnValueOnce(new Promise(resolve => { resolveRequest = resolve }))
    fireEvent.click(screen.getByRole('button', { name: 'View Overall Grade Distribution' }))
    expect(screen.getByRole('status')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Close grade distribution' }))
    fireEvent.click(screen.getByRole('button', { name: 'View 3 sections' }))
    fireEvent.click(screen.getByRole('button', { name: 'View Grade Distribution', exact: true }))
    await act(async () => { resolveRequest({ ok: true, json: async () => aggregate }) })
    expect(screen.getByText('CMPE 120 · Ada Chen')).toBeDefined()
    expect(screen.getByText('Based on 30 grades')).toBeDefined()
  })

  it('preserves Add and Remove alongside the unavailable-data message', () => {
    renderGrades([sections[1]])
    fireEvent.click(screen.getByRole('button', { name: 'View 1 sections' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }))
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.getByRole('button', { name: 'Add', exact: true })).toBeDefined()
    expect(screen.getByText('Grade distribution data unavailable for this professor')).toBeDefined()
  })
})
