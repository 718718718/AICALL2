const express = require('express');
const router = express.Router();
const {
  getConferenceParticipants,
  muteParticipant,
  holdParticipant,
  removeParticipant,
  addParticipant,
  playAudioToConference,
  manageRecording,
  getConferenceStatus
} = require('../controllers/conferenceController');
const { protect } = require('../middlewares/authMiddleware');

// Conference管理エンドポイント
router.get('/:callId/conference/status', protect, getConferenceStatus);
router.get('/:callId/conference/participants', protect, getConferenceParticipants);
router.post('/:callId/conference/participants', protect, addParticipant);
router.put('/:callId/conference/participants/:participantSid/mute', protect, muteParticipant);
router.put('/:callId/conference/participants/:participantSid/hold', protect, holdParticipant);
router.delete('/:callId/conference/participants/:participantSid', protect, removeParticipant);
router.post('/:callId/conference/play', protect, playAudioToConference);
router.put('/:callId/conference/recording', protect, manageRecording);

module.exports = router;