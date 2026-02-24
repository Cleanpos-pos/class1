; =====================================================
; CleanPos - Posso One Suite
; Custom NSIS Installer Script
; =====================================================

!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"

; Variables for terms page
Var TermsDialog
Var TermsCheckbox
Var TermsAccepted

; =====================================================
; Custom Terms Page - Inserted Before License
; =====================================================

!macro customPageBeforeLicense
  Page custom CreateTermsPage LeaveTermsPage
!macroend

Function CreateTermsPage
  StrCpy $TermsAccepted "0"

  !insertmacro MUI_HEADER_TEXT "Terms & Conditions" "Please accept the software terms to continue"

  nsDialogs::Create 1018
  Pop $TermsDialog

  ${If} $TermsDialog == error
    Abort
  ${EndIf}

  ; Title
  ${NSD_CreateLabel} 0 0 100% 20u "Welcome to CleanPos - Part of the Posso One Suite"
  Pop $0
  CreateFont $1 "Segoe UI" 12 700
  SendMessage $0 ${WM_SETFONT} $1 0

  ; Description
  ${NSD_CreateLabel} 0 25u 100% 50u "Before installing CleanPos, you must agree to our Software Terms and Conditions.$\r$\n$\r$\nThese terms govern your use of the software, including data handling, payment processing, and support provisions."
  Pop $0

  ; Link info
  ${NSD_CreateLabel} 0 80u 100% 15u "View full terms at: https://posso.co.uk/software-terms"
  Pop $0
  SetCtlColors $0 0x0066CC transparent

  ; Open link button
  ${NSD_CreateButton} 0 100u 150u 25u "Open Terms in Browser"
  Pop $0
  ${NSD_OnClick} $0 OnOpenTerms

  ; Separator
  ${NSD_CreateHLine} 0 135u 100% 2u
  Pop $0

  ; Checkbox - REQUIRED
  ${NSD_CreateCheckbox} 0 145u 100% 20u "I have read and AGREE to the Software Terms and Conditions"
  Pop $TermsCheckbox
  CreateFont $1 "Segoe UI" 10 700
  SendMessage $TermsCheckbox ${WM_SETFONT} $1 0
  ${NSD_OnClick} $TermsCheckbox OnTermsToggle

  ; Warning
  ${NSD_CreateLabel} 0 170u 100% 15u "* You must check the box above to continue installation"
  Pop $0
  SetCtlColors $0 0xCC0000 transparent

  ; Disable Next button
  GetDlgItem $0 $HWNDPARENT 1
  EnableWindow $0 0

  nsDialogs::Show
FunctionEnd

Function OnOpenTerms
  ExecShell "open" "https://posso.co.uk/software-terms"
FunctionEnd

Function OnTermsToggle
  ${NSD_GetState} $TermsCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $TermsAccepted "1"
    GetDlgItem $1 $HWNDPARENT 1
    EnableWindow $1 1
  ${Else}
    StrCpy $TermsAccepted "0"
    GetDlgItem $1 $HWNDPARENT 1
    EnableWindow $1 0
  ${EndIf}
FunctionEnd

Function LeaveTermsPage
  ${If} $TermsAccepted != "1"
    MessageBox MB_ICONEXCLAMATION|MB_OK "You must accept the Software Terms and Conditions to install CleanPos."
    Abort
  ${EndIf}
FunctionEnd

; =====================================================
; Customize Welcome Page
; =====================================================

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to CleanPos Setup"
  !define MUI_WELCOMEPAGE_TEXT "This wizard will install CleanPos on your computer.$\r$\n$\r$\nCleanPos is a professional dry cleaning and laundry point-of-sale system, part of the Posso One Suite.$\r$\n$\r$\nFeatures:$\r$\n  - Label printing (Brother QL-800)$\r$\n  - Customer management$\r$\n  - Stripe payments$\r$\n  - Cloud sync$\r$\n$\r$\nClick Next to continue."
!macroend

; =====================================================
; Customize Finish Page
; =====================================================

!macro customFinishPage
  !define MUI_FINISHPAGE_TITLE "Installation Complete"
  !define MUI_FINISHPAGE_TEXT "CleanPos has been successfully installed.$\r$\n$\r$\nClick Finish to close the installer."
  !define MUI_FINISHPAGE_RUN "$INSTDIR\${PRODUCT_FILENAME}.exe"
  !define MUI_FINISHPAGE_RUN_TEXT "Launch CleanPos"
  !define MUI_FINISHPAGE_LINK "Get support at posso.co.uk"
  !define MUI_FINISHPAGE_LINK_LOCATION "https://posso.co.uk"
!macroend

; =====================================================
; Uninstaller Customization
; =====================================================

!macro customUnInstall
  Delete "$DESKTOP\CleanPos.lnk"
  RMDir /r "$SMPROGRAMS\CleanPos"
!macroend
