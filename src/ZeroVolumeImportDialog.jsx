import React from 'react';
import Modal from './Modal.jsx';
import './multipart-import.css';
export default function ZeroVolumeImportDialog({onContinue}){return <Modal className="multipart-import-dialog" aria-label="The volume of the object is zero" onClose={onContinue}><h2>The volume of the object is zero</h2><div className="multipart-message"><img src="/native-dialogs/info.svg" width="64" height="64" alt="Information"/><p>Objects with zero volume removed</p></div><footer><button className="native-confirm" autoFocus onClick={onContinue}>OK</button></footer></Modal>;}
