import { createContext, useContext, useState } from "react";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [toast, setToast] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null); // { message, onConfirm, danger }

  return (
    <AppContext.Provider value={{ toast, setToast, confirmDialog, setConfirmDialog }}>
      {children}
      {confirmDialog && (
        <div className="modal-overlay" onClick={() => setConfirmDialog(null)}>
          <div className="modal-content confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="confirm-dialog-message">{confirmDialog.message}</p>
            <div className="confirm-dialog-actions">
              <button className="ghost-button" type="button" onClick={() => setConfirmDialog(null)}>
                Cancel
              </button>
              <button
                className={`primary-button${confirmDialog.danger ? " danger-button" : ""}`}
                type="button"
                onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  return useContext(AppContext);
}
