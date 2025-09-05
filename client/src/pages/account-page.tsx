import AccountFormContainer from "@/components/forms/account-form-container";

export default function AccountPage() {
  return (
    <AccountFormContainer 
      open={false} // Not used in full-page mode
      onOpenChange={() => {}} // Not used in full-page mode
      onSuccess={() => {
        // Navigate back to main page
        window.location.href = "/";
      }}
    />
  );
}