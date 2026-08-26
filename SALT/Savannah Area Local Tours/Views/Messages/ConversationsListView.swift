import SwiftUI

struct Conversation: Identifiable, Hashable {
    let id: String
    let member: User
    let lastMessage: String
    let updatedAt: Date
}

struct ConversationsListView: View {
    private var conversations: [Conversation] {
        MockData.members
            .filter { $0.id != AuthService.shared.currentUser?.id }
            .map { member in
                Conversation(
                    id: [AuthService.shared.currentUser?.id ?? "current", member.id].sorted().joined(separator: "-"),
                    member: member,
                    lastMessage: "Start a conversation with \(member.displayName).",
                    updatedAt: member.joinDate
                )
            }
    }

    var body: some View {
        List(conversations) { conversation in
            NavigationLink {
                ChatView(conversationId: conversation.id, otherName: conversation.member.displayName)
            } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text(conversation.member.displayName)
                        .font(SaltTypography.headline)
                    Text(conversation.lastMessage)
                        .font(SaltTypography.subheadline)
                        .foregroundStyle(Color.saltSecondaryLabel)
                        .lineLimit(2)
                }
                .padding(.vertical, 4)
            }
        }
        .navigationTitle("Messages")
    }
}

struct ChatView: View {
    let conversationId: String
    let otherName: String
    @State private var draftMessage = ""
    @State private var messages = ["Thanks for connecting through SALT."]

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    ForEach(messages.indices, id: \.self) { index in
                        Text(messages[index])
                            .font(SaltTypography.body)
                            .padding(12)
                            .background(index.isMultiple(of: 2) ? Color.saltSecondaryBackground : Color.saltPurple.opacity(0.12))
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                            .frame(maxWidth: .infinity, alignment: index.isMultiple(of: 2) ? .leading : .trailing)
                    }
                }
                .padding()
            }

            Divider()

            HStack(spacing: 8) {
                TextField("Message", text: $draftMessage, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(1...4)

                Button {
                    sendMessage()
                } label: {
                    Image(systemName: "paperplane.fill")
                }
                .buttonStyle(.borderedProminent)
                .disabled(draftMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .padding()
        }
        .navigationTitle(otherName)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func sendMessage() {
        let trimmedMessage = draftMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedMessage.isEmpty else { return }
        messages.append(trimmedMessage)
        draftMessage = ""
    }
}
