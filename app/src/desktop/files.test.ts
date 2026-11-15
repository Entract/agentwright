import { describe, expect, it } from 'vitest'
import { fileName, runTarget } from './files'

describe('fileName', () => {
  it('adds .py when no ending is typed', () => {
    expect(fileName(' tools ', [])).toEqual({ name: 'tools.py' })
  })
  it('accepts data files', () => {
    expect(fileName('schedule.json', [])).toEqual({ name: 'schedule.json' })
    expect(fileName('notes 1.txt', [])).toEqual({ name: 'notes 1.txt' })
  })
  it('refuses paths and unknown endings', () => {
    expect(fileName('../x.py', []).problem).toBeTruthy()
    expect(fileName('a\\b.py', []).problem).toBeTruthy()
    expect(fileName('run.exe', []).problem).toBeTruthy()
    expect(fileName('.env', []).problem).toBeTruthy()
  })
  it('refuses a name already used, whatever the capitals', () => {
    expect(fileName('Tools.py', ['tools.py']).problem).toMatch(/already/)
  })
  it('refuses names that would hide a Python module', () => {
    expect(fileName('json', []).problem).toMatch(/import json/)
    expect(fileName('datetime.py', []).problem).toMatch(/my_datetime\.py/)
    expect(fileName('json.txt', [])).toEqual({ name: 'json.txt' })
  })
  it('refuses Python names import cannot use', () => {
    expect(fileName('2tools.py', []).problem).toBeTruthy()
    expect(fileName('my tools.py', []).problem).toBeTruthy()
  })
})

describe('runTarget', () => {
  it('runs the Python tab that is showing', () => {
    expect(runTarget('', 'a.py', ['a.py'])).toBe('')
    expect(runTarget('b.py', 'a.py', ['a.py', 'b.py'])).toBe('b.py')
  })
  it('runs the last Python tab when a data file is showing', () => {
    expect(runTarget('s.json', 'a.py', ['a.py', 's.json'])).toBe('a.py')
    expect(runTarget('s.json', '', ['s.json'])).toBe('')
    expect(runTarget('s.json', 'gone.py', ['s.json'])).toBe('')
  })
})
