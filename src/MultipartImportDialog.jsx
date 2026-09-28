import React from 'react';
import Modal from './Modal.jsx';
import './multipart-import.css';
export default function MultipartImportDialog({onChoose}){return <Modal className="multipart-import-dialog" aria-label="Multi-part object detected" onClose={()=>onChoose(false)}><h2>Multi-part object detected</h2><div className="multipart-message"><img src="/native-dialogs/exclamation.svg" width="64" height="64" alt="Warning"/><p>This file contains several objects positioned at multiple heights. <br/>Instead of considering them as multiple objects, should <br/>the file be loaded as a single object having multiple parts?</p></div><footer><button className="native-confirm" autoFocus onClick={()=>onChoose(true)}>Yes</button><button onClick={()=>onChoose(false)}>No</button></footer></Modal>;}
