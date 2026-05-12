# muChordbot Data Spec

## PitchPreset
- `id`
- `name`
- `shortName`
- `cent`
- `microStep`
- `tags[]`
- `memo`
- `symbolRuleKey`
- `symbolMap`

## ChordPreset
- `id`
- `name`
- `baseRoot`
- `tones[]`
- `tags[]`
- `memo`

## ProgressionPart
- `id`
- `chordId`
- `root { octave, microStepInOctave, noteText?, pitchPresetId? }`
- `bass { enabled, octave, microStepInOctave, pitchPresetId? }`
- `beats`

## Project Payload
- `settings`
- `pitchPresets`
- `chordPresets`
- `progression`
- `progressionEditor`

## Library Payload
- `pitchPresets`
- `chordPresets`
